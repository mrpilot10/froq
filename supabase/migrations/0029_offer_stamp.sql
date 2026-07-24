-- Merchant can award a stamp directly from the customers admin (no customer request).

create or replace function offer_stamp(p_customer_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_banned boolean;
  v_stamps int;
  v_status card_status;
  v_cooldown timestamptz;
  v_restart boolean;
  v_total int;
  v_aov numeric;
  v_new int;
begin
  select c.merchant_id, c.branch_id, c.banned
    into v_merchant, v_branch, v_banned
  from customers c
  where c.id = p_customer_id;

  if v_merchant is null then
    raise exception 'Customer not found';
  end if;
  if not auth_owns_merchant(v_merchant) then
    raise exception 'Not allowed';
  end if;
  if coalesce(v_banned, false) then
    raise exception 'This customer is banned';
  end if;

  select lc.stamps, lc.status, lc.cooldown_until
    into v_stamps, v_status, v_cooldown
  from loyalty_cards lc
  where lc.customer_id = p_customer_id;

  if v_status is null then
    raise exception 'Loyalty card not found';
  end if;

  if v_status = 'reward_ready' then
    raise exception 'Redeem their current reward before offering another stamp';
  end if;

  if v_status = 'claimed' then
    select restart_after_reward into v_restart from merchants where id = v_merchant;
    if not coalesce(v_restart, true) then
      raise exception 'This rewards program is complete for this customer';
    end if;
  end if;

  if v_cooldown is not null and v_cooldown > now() then
    raise exception 'Next stamp card is locked until %',
      to_char(v_cooldown at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
  end if;

  if v_cooldown is not null and v_cooldown <= now() then
    update loyalty_cards
      set cooldown_until = null,
          status = case when status = 'claimed' then 'active'::card_status else status end
      where customer_id = p_customer_id;
  end if;

  if exists (
    select 1 from approvals
    where customer_id = p_customer_id and status = 'pending'
  ) then
    raise exception 'A stamp request is already pending for this customer';
  end if;

  select total_stamps, avg_order_value into v_total, v_aov
  from merchants where id = v_merchant;

  if v_branch is null then
    select id into v_branch from branches
    where merchant_id = v_merchant and is_default
    limit 1;
  end if;

  -- History row so the customer sees "Stamp collected".
  insert into approvals (
    merchant_id, branch_id, customer_id, stamps_before, status, resolved_at
  ) values (
    v_merchant, v_branch, p_customer_id, coalesce(v_stamps, 0), 'approved', now()
  );

  update loyalty_cards
    set stamps = least(stamps + 1, v_total)
    where customer_id = p_customer_id
    returning stamps into v_new;

  update loyalty_cards
    set status = (case when v_new >= v_total then 'reward_ready' else 'active' end)::card_status,
        reward_code = case when v_new >= v_total then gen_reward_code() else null end
    where customer_id = p_customer_id;

  insert into visits (customer_id, merchant_id, branch_id, amount)
  values (p_customer_id, v_merchant, v_branch, coalesce(v_aov, 0));

  return v_new;
end;
$$;

revoke all on function offer_stamp(uuid) from public, anon;
grant execute on function offer_stamp(uuid) to authenticated;
