-- Remove Average Order Value / LTV from loyalty.
-- Stamp RPCs stop reading merchants.avg_order_value; visits.amount is recorded as 0.
-- Then drop the column.

create or replace function approve_stamp(p_approval_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
  v_branch uuid;
  v_total int;
  v_new int;
  v_stamps int;
  v_status card_status;
  v_cooldown timestamptz;
  v_restart boolean;
  v_wait timestamptz;
  v_now timestamptz := now();
begin
  select a.merchant_id, a.customer_id, a.branch_id into v_merchant, v_customer, v_branch
  from approvals a where a.id = p_approval_id and a.status = 'pending';
  if v_merchant is null then raise exception 'Approval not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;

  select lc.stamps, lc.status, lc.cooldown_until
    into v_stamps, v_status, v_cooldown
  from loyalty_cards lc
  where lc.customer_id = v_customer;

  if v_status is null then raise exception 'Loyalty card not found'; end if;
  if v_status = 'reward_ready' then
    raise exception 'Redeem their current reward before approving another stamp';
  end if;

  if v_status = 'claimed' then
    select restart_after_reward into v_restart from merchants where id = v_merchant;
    if not coalesce(v_restart, true) then
      raise exception 'This rewards program is complete for this customer';
    end if;
  end if;

  if v_cooldown is not null and v_cooldown > v_now then
    raise exception 'Next stamp card is locked until %',
      to_char(v_cooldown at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
  end if;

  if v_cooldown is not null and v_cooldown <= v_now then
    update loyalty_cards
      set cooldown_until = null,
          status = case when status = 'claimed' then 'active'::card_status else status end
      where customer_id = v_customer;
  end if;

  select total_stamps into v_total
  from merchants where id = v_merchant;

  update loyalty_cards
    set stamps = least(stamps + 1, v_total)
    where customer_id = v_customer
    returning stamps into v_new;

  if v_new >= v_total then
    v_wait := merchant_cooldown_until(v_merchant);
    if v_wait is null then
      update loyalty_cards
        set status = 'reward_ready'::card_status,
            reward_code = gen_reward_code(),
            last_stamp_assigned_at = v_now,
            reward_unlock_at = null,
            reward_unlocked_at = v_now,
            reward_ready_message_sent = false,
            reward_status = 'ready'::reward_cycle_status
        where customer_id = v_customer;
    else
      update loyalty_cards
        set status = 'reward_ready'::card_status,
            reward_code = gen_reward_code(),
            last_stamp_assigned_at = v_now,
            reward_unlock_at = v_wait,
            reward_unlocked_at = null,
            reward_ready_message_sent = false,
            reward_status = 'waiting'::reward_cycle_status
        where customer_id = v_customer;
    end if;
  else
    update loyalty_cards
      set status = 'active'::card_status,
          reward_code = null,
          reward_status = 'collecting'::reward_cycle_status
      where customer_id = v_customer;
  end if;

  insert into visits (customer_id, merchant_id, branch_id, amount)
  values (v_customer, v_merchant, v_branch, 0);

  update approvals set status = 'approved', resolved_at = v_now where id = p_approval_id;
end; $$;

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
  v_new int;
  v_wait timestamptz;
  v_now timestamptz := now();
begin
  select c.merchant_id, c.branch_id, c.banned
    into v_merchant, v_branch, v_banned
  from customers c
  where c.id = p_customer_id;

  if v_merchant is null then raise exception 'Customer not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if coalesce(v_banned, false) then raise exception 'This customer is banned'; end if;

  select lc.stamps, lc.status, lc.cooldown_until
    into v_stamps, v_status, v_cooldown
  from loyalty_cards lc
  where lc.customer_id = p_customer_id;

  if v_status is null then raise exception 'Loyalty card not found'; end if;
  if v_status = 'reward_ready' then
    raise exception 'Redeem their current reward before offering another stamp';
  end if;

  if v_status = 'claimed' then
    select restart_after_reward into v_restart from merchants where id = v_merchant;
    if not coalesce(v_restart, true) then
      raise exception 'This rewards program is complete for this customer';
    end if;
  end if;

  if v_cooldown is not null and v_cooldown > v_now then
    raise exception 'Next stamp card is locked until %',
      to_char(v_cooldown at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
  end if;

  if v_cooldown is not null and v_cooldown <= v_now then
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

  select total_stamps into v_total
  from merchants where id = v_merchant;

  if v_branch is null then
    select id into v_branch from branches
    where merchant_id = v_merchant and is_default
    limit 1;
  end if;

  insert into approvals (
    merchant_id, branch_id, customer_id, stamps_before, status, resolved_at
  ) values (
    v_merchant, v_branch, p_customer_id, coalesce(v_stamps, 0), 'approved', v_now
  );

  update loyalty_cards
    set stamps = least(stamps + 1, v_total)
    where customer_id = p_customer_id
    returning stamps into v_new;

  if v_new >= v_total then
    v_wait := merchant_cooldown_until(v_merchant);
    if v_wait is null then
      update loyalty_cards
        set status = 'reward_ready'::card_status,
            reward_code = gen_reward_code(),
            last_stamp_assigned_at = v_now,
            reward_unlock_at = null,
            reward_unlocked_at = v_now,
            reward_ready_message_sent = false,
            reward_status = 'ready'::reward_cycle_status
        where customer_id = p_customer_id;
    else
      update loyalty_cards
        set status = 'reward_ready'::card_status,
            reward_code = gen_reward_code(),
            last_stamp_assigned_at = v_now,
            reward_unlock_at = v_wait,
            reward_unlocked_at = null,
            reward_ready_message_sent = false,
            reward_status = 'waiting'::reward_cycle_status
        where customer_id = p_customer_id;
    end if;
  else
    update loyalty_cards
      set status = 'active'::card_status,
          reward_code = null,
          reward_status = 'collecting'::reward_cycle_status
      where customer_id = p_customer_id;
  end if;

  insert into visits (customer_id, merchant_id, branch_id, amount)
  values (p_customer_id, v_merchant, v_branch, 0);

  return v_new;
end;
$$;

alter table merchants drop column if exists avg_order_value;
