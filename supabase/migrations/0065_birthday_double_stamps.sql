-- Birthday + double-stamp loyalty promo.
-- 1) Customers can store a birthdate (collected on loyalty join).
-- 2) Merchants can opt in to birthday double-stamp notifications + awarding.
-- 3) Stamp approve/offer awards 2 stamps on the customer's birthday when enabled.

alter table customers
  add column if not exists birthdate date;

comment on column customers.birthdate is
  'Customer birthday (date only). Used for birthday double-stamp promos.';

alter table customers
  add column if not exists birthday_notify_year integer;

comment on column customers.birthday_notify_year is
  'Calendar year of the last birthday double-stamp notification sent (Asia/Kolkata).';

alter table merchants
  add column if not exists birthday_double_stamps boolean not null default false;

comment on column merchants.birthday_double_stamps is
  'When true: notify customers on their birthday that they can earn double stamps, and award 2 stamps per visit that day.';

-- Stamp gain: 2 on birthday when merchant enabled, else 1.
create or replace function loyalty_birthday_stamp_gain(
  p_merchant_id uuid,
  p_customer_id uuid,
  p_now timestamptz default now()
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_birthdate date;
  v_today date;
begin
  select birthday_double_stamps into v_enabled
  from merchants
  where id = p_merchant_id;

  if not coalesce(v_enabled, false) then
    return 1;
  end if;

  select birthdate into v_birthdate
  from customers
  where id = p_customer_id;

  if v_birthdate is null then
    return 1;
  end if;

  v_today := (p_now at time zone 'Asia/Kolkata')::date;

  if extract(month from v_birthdate) = extract(month from v_today)
     and extract(day from v_birthdate) = extract(day from v_today) then
    return 2;
  end if;

  return 1;
end;
$$;

create or replace function join_merchant(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_branch text default null,
  p_birthdate date default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_customer uuid;
  v_existing uuid;
  v_plan text;
  v_max int;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_merchant from merchants where slug = p_slug;
  if v_merchant is null then
    raise exception 'Shop not found';
  end if;

  if p_branch is not null then
    select id into v_branch from branches where slug = p_branch and merchant_id = v_merchant;
  end if;
  if v_branch is null then
    select id into v_branch from branches where merchant_id = v_merchant and is_default limit 1;
  end if;

  select id into v_existing
  from customers
  where merchant_id = v_merchant and phone = p_phone
  limit 1;

  -- Only brand-new customers consume a plan seat.
  if v_existing is null then
    select plan_id into v_plan
    from merchant_products
    where merchant_id = v_merchant and product = 'loyalty'
    limit 1;

    v_max := case
      when v_plan = 'free' then 50
      when v_plan is null then 500
      when v_plan in ('starter', 'starter-yearly') then 500
      when v_plan in ('growth', 'growth-yearly') then 2000
      when v_plan in ('pro', 'pro-yearly') then 10000
      else 500
    end;

    select count(*)::int into v_count
    from customers
    where merchant_id = v_merchant and banned = false;

    if v_count >= v_max then
      raise exception
        'This loyalty program is full right now. Please ask the store to upgrade their plan.';
    end if;
  end if;

  insert into customers (merchant_id, branch_id, user_id, name, phone, email, birthdate)
  values (
    v_merchant,
    v_branch,
    auth.uid(),
    p_name,
    p_phone,
    nullif(trim(p_email), ''),
    p_birthdate
  )
  on conflict (merchant_id, phone)
  do update set
    user_id = excluded.user_id,
    name = excluded.name,
    email = coalesce(excluded.email, customers.email),
    branch_id = coalesce(excluded.branch_id, customers.branch_id),
    birthdate = coalesce(excluded.birthdate, customers.birthdate)
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id, branch_id)
  values (v_customer, v_merchant, v_branch)
  on conflict (customer_id) do nothing;

  return v_customer;
end;
$$;

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
  v_gain int := 1;
  v_i int;
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

  v_gain := loyalty_birthday_stamp_gain(v_merchant, v_customer, v_now);

  update loyalty_cards
    set stamps = least(stamps + v_gain, v_total)
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

  for v_i in 1..v_gain loop
    insert into visits (customer_id, merchant_id, branch_id, amount)
    values (v_customer, v_merchant, v_branch, 0);
  end loop;

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
  v_gain int := 1;
  v_i int;
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

  v_gain := loyalty_birthday_stamp_gain(v_merchant, p_customer_id, v_now);

  update loyalty_cards
    set stamps = least(stamps + v_gain, v_total)
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

  for v_i in 1..v_gain loop
    insert into visits (customer_id, merchant_id, branch_id, amount)
    values (p_customer_id, v_merchant, v_branch, 0);
  end loop;

  return v_new;
end;
$$;
