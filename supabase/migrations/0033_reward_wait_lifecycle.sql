-- Explicit reward wait-time lifecycle on loyalty_cards.
-- QR wait uses reward_unlock_at / reward_status; cooldown_until stays for
-- post-redeem stamp-collection lock only.

do $$ begin
  create type reward_cycle_status as enum ('collecting', 'waiting', 'ready');
exception
  when duplicate_object then null;
end $$;

alter table loyalty_cards
  add column if not exists last_stamp_assigned_at timestamptz;

alter table loyalty_cards
  add column if not exists reward_unlock_at timestamptz;

alter table loyalty_cards
  add column if not exists reward_unlocked_at timestamptz;

alter table loyalty_cards
  add column if not exists reward_ready_message_sent boolean not null default false;

alter table loyalty_cards
  add column if not exists reward_status reward_cycle_status not null default 'collecting';

comment on column loyalty_cards.last_stamp_assigned_at is
  'When the final stamp that completed the card was assigned.';
comment on column loyalty_cards.reward_unlock_at is
  'Precomputed QR unlock time (last_stamp_assigned_at + merchant wait). Null when no wait.';
comment on column loyalty_cards.reward_unlocked_at is
  'When reward_status moved to ready (cron or immediate unlock).';
comment on column loyalty_cards.reward_ready_message_sent is
  'True only after loyaltycard_reward_ready_wait_time sent successfully.';
comment on column loyalty_cards.reward_status is
  'collecting | waiting (QR locked) | ready (QR redeemable).';

-- Backfill from previous cooldown_until-based QR wait.
update loyalty_cards
set
  last_stamp_assigned_at = coalesce(last_stamp_assigned_at, updated_at, now()),
  reward_unlock_at = cooldown_until,
  reward_unlocked_at = case
    when reward_wait_notified_at is not null then reward_wait_notified_at
    when cooldown_until is not null and cooldown_until <= now() then now()
    else null
  end,
  reward_ready_message_sent = coalesce(reward_wait_notified_at is not null, false),
  reward_status = case
    when reward_wait_notified_at is not null then 'ready'::reward_cycle_status
    when cooldown_until is not null and cooldown_until > now() then 'waiting'::reward_cycle_status
    else 'ready'::reward_cycle_status
  end
where status = 'reward_ready'
  and cooldown_until is not null;

update loyalty_cards
set
  reward_status = 'ready'::reward_cycle_status,
  reward_unlocked_at = coalesce(reward_unlocked_at, now()),
  last_stamp_assigned_at = coalesce(last_stamp_assigned_at, updated_at, now())
where status = 'reward_ready'
  and cooldown_until is null
  and reward_status = 'collecting';

-- QR wait no longer stored on cooldown_until for reward_ready cards.
update loyalty_cards
set cooldown_until = null
where status = 'reward_ready'
  and reward_unlock_at is not null;

create or replace function approve_stamp(p_approval_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
  v_branch uuid;
  v_total int;
  v_aov numeric;
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

  select total_stamps, avg_order_value into v_total, v_aov
  from merchants where id = v_merchant;

  update loyalty_cards
    set stamps = least(stamps + 1, v_total)
    where customer_id = v_customer
    returning stamps into v_new;

  if v_new >= v_total then
    v_wait := merchant_cooldown_until(v_merchant);
    if v_wait is null then
      -- No wait configured: redeemable immediately.
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
      -- Wait configured: lock QR until precomputed unlock time.
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
  values (v_customer, v_merchant, v_branch, coalesce(v_aov, 0));

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
  v_aov numeric;
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

  select total_stamps, avg_order_value into v_total, v_aov
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
  values (p_customer_id, v_merchant, v_branch, coalesce(v_aov, 0));

  return v_new;
end;
$$;

create or replace function redeem_reward(p_customer_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_status card_status;
  v_reward_status reward_cycle_status;
  v_unlock timestamptz;
  v_restart boolean;
  v_until timestamptz;
  v_now timestamptz := now();
begin
  select merchant_id, branch_id, status, reward_status, reward_unlock_at
    into v_merchant, v_branch, v_status, v_reward_status, v_unlock
  from loyalty_cards where customer_id = p_customer_id;
  if v_merchant is null then raise exception 'Card not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if v_status <> 'reward_ready' then raise exception 'Reward not ready'; end if;

  if v_reward_status = 'waiting' or (v_unlock is not null and v_unlock > v_now) then
    raise exception 'Reward QR is locked until %',
      to_char(coalesce(v_unlock, v_now) at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
  end if;

  select restart_after_reward into v_restart from merchants where id = v_merchant;

  v_until := null;
  if coalesce(v_restart, true) then
    v_until := merchant_cooldown_until(v_merchant);
  end if;

  if coalesce(v_restart, true) then
    update loyalty_cards
      set stamps = 0,
          status = 'active',
          reward_code = null,
          cooldown_until = v_until,
          last_stamp_assigned_at = null,
          reward_unlock_at = null,
          reward_unlocked_at = null,
          reward_ready_message_sent = false,
          reward_status = 'collecting'::reward_cycle_status,
          reward_wait_notified_at = null
      where customer_id = p_customer_id;
  else
    update loyalty_cards
      set stamps = 0,
          status = 'claimed',
          reward_code = null,
          cooldown_until = null,
          last_stamp_assigned_at = null,
          reward_unlock_at = null,
          reward_unlocked_at = null,
          reward_ready_message_sent = false,
          reward_status = 'collecting'::reward_cycle_status,
          reward_wait_notified_at = null
      where customer_id = p_customer_id;
  end if;

  update approvals
    set status = 'rejected', resolved_at = v_now
    where customer_id = p_customer_id and status = 'pending';

  insert into redemptions (merchant_id, branch_id, customer_id, code)
  values (v_merchant, v_branch, p_customer_id, p_code);
end; $$;

revoke all on function offer_stamp(uuid) from public, anon;
grant execute on function offer_stamp(uuid) to authenticated;
