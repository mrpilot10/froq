-- Give each reward-ready card a unique, random alphanumeric redemption code
-- (e.g. FROQ-7K3QM) instead of deriving it from the customer id. The code is
-- generated when a card reaches reward_ready and cleared once redeemed.

alter table loyalty_cards
  add column if not exists reward_code text;

-- Random FROQ-XXXXX code. Uses an unambiguous uppercase charset (no O/0/I/1)
-- so staff can read it aloud reliably.
create or replace function gen_reward_code()
returns text language plpgsql as $$
declare
  chars  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..5 loop
    result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
  end loop;
  return 'FROQ-' || result;
end; $$;

-- Set the code when a card becomes reward_ready; clear it otherwise.
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
    set status = (case when v_new >= v_total then 'reward_ready' else 'active' end)::card_status,
        reward_code = case when v_new >= v_total then gen_reward_code() else null end
    where customer_id = v_customer;

  insert into visits (customer_id, merchant_id, amount)
  values (v_customer, v_merchant, coalesce(v_aov, 0));

  update approvals set status = 'approved', resolved_at = now() where id = p_approval_id;
end; $$;

-- Clear the code once the reward is redeemed and the card resets.
create or replace function redeem_reward(p_customer_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_status card_status;
begin
  select merchant_id, status into v_merchant, v_status
  from loyalty_cards where customer_id = p_customer_id;
  if v_merchant is null then raise exception 'Card not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if v_status <> 'reward_ready' then raise exception 'Reward not ready'; end if;

  update loyalty_cards
    set stamps = 0, status = 'active', reward_code = null
    where customer_id = p_customer_id;
  insert into redemptions (merchant_id, customer_id, code)
  values (v_merchant, p_customer_id, p_code);
end; $$;

-- Backfill any existing reward-ready cards with a code.
update loyalty_cards
  set reward_code = gen_reward_code()
  where status = 'reward_ready' and reward_code is null;
