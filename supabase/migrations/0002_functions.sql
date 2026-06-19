-- Froq SaaS — transactional RPCs for the core loyalty operations.
-- These run with the caller's identity (auth.uid()) and enforce their own checks.

-- Customer self-enrolls into a shop via its QR/slug. Idempotent.
create or replace function join_merchant(p_slug text, p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_merchant from merchants where slug = p_slug;
  if v_merchant is null then
    raise exception 'Shop not found';
  end if;

  -- One customer row per (merchant, phone). Re-joining returns the existing row.
  insert into customers (merchant_id, user_id, name, phone)
  values (v_merchant, auth.uid(), p_name, p_phone)
  on conflict (merchant_id, phone)
  do update set user_id = excluded.user_id, name = excluded.name
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id)
  values (v_customer, v_merchant)
  on conflict (customer_id) do nothing;

  return v_customer;
end; $$;

-- Customer requests a stamp → creates a pending approval (no duplicates).
create or replace function request_stamp(p_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_stamps int;
  v_approval uuid;
begin
  if not auth_owns_customer(p_customer_id) then
    raise exception 'Not allowed';
  end if;

  select merchant_id into v_merchant from customers where id = p_customer_id;
  select stamps into v_stamps from loyalty_cards where customer_id = p_customer_id;

  if exists (select 1 from approvals where customer_id = p_customer_id and status = 'pending') then
    raise exception 'A stamp request is already pending';
  end if;

  insert into approvals (merchant_id, customer_id, stamps_before)
  values (v_merchant, p_customer_id, coalesce(v_stamps, 0))
  returning id into v_approval;

  return v_approval;
end; $$;

-- Merchant approves a stamp request: +1 stamp, log a visit, advance status.
create or replace function approve_stamp(p_approval_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
  v_total int;
  v_aov numeric;
  v_new int;
begin
  select a.merchant_id, a.customer_id into v_merchant, v_customer
  from approvals a where a.id = p_approval_id and a.status = 'pending';
  if v_merchant is null then
    raise exception 'Approval not found';
  end if;
  if not auth_owns_merchant(v_merchant) then
    raise exception 'Not allowed';
  end if;

  select total_stamps, avg_order_value into v_total, v_aov
  from merchants where id = v_merchant;

  update loyalty_cards
    set stamps = least(stamps + 1, v_total)
    where customer_id = v_customer
    returning stamps into v_new;

  update loyalty_cards
    set status = case when v_new >= v_total then 'reward_ready' else 'active' end
    where customer_id = v_customer;

  insert into visits (customer_id, merchant_id, amount)
  values (v_customer, v_merchant, coalesce(v_aov, 0));

  update approvals set status = 'approved', resolved_at = now() where id = p_approval_id;
end; $$;

create or replace function reject_stamp(p_approval_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from approvals where id = p_approval_id and status = 'pending';
  if v_merchant is null then raise exception 'Approval not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  update approvals set status = 'rejected', resolved_at = now() where id = p_approval_id;
end; $$;

-- Merchant redeems a reward-ready card: mark claimed + record redemption code.
create or replace function redeem_reward(p_customer_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_status card_status;
begin
  select merchant_id, status into v_merchant, v_status
  from loyalty_cards where customer_id = p_customer_id;
  if v_merchant is null then raise exception 'Card not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if v_status <> 'reward_ready' then raise exception 'Reward not ready'; end if;

  update loyalty_cards set stamps = 0, status = 'claimed' where customer_id = p_customer_id;
  insert into redemptions (merchant_id, customer_id, code)
  values (v_merchant, p_customer_id, p_code);
end; $$;
