-- Loyalty program rules: restart after reward, cooldown, min purchase condition.

alter table merchants
  add column if not exists restart_after_reward boolean not null default true;

alter table merchants
  add column if not exists reward_cooldown_value int not null default 0
    check (reward_cooldown_value >= 0);

alter table merchants
  add column if not exists reward_cooldown_unit text not null default 'days'
    check (reward_cooldown_unit in ('hours', 'days', 'weeks'));

alter table merchants
  add column if not exists min_purchase_amount numeric not null default 0
    check (min_purchase_amount >= 0);

comment on column merchants.restart_after_reward is
  'When true (default), customers can start a new stamp card after redeeming. Hidden from onboarding.';

comment on column merchants.reward_cooldown_value is
  'Wait time before the next stamp card unlocks after a redemption. 0 = no cooldown.';

comment on column merchants.min_purchase_amount is
  'Condition shown to customers: reward / stamps apply with a purchase of ₹X and above. 0 = no condition.';

alter table loyalty_cards
  add column if not exists cooldown_until timestamptz;

comment on column loyalty_cards.cooldown_until is
  'When set in the future, the customer cannot request stamps until this time.';

create or replace function request_stamp(p_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_stamps int;
  v_status card_status;
  v_cooldown timestamptz;
  v_approval uuid;
  v_restart boolean;
begin
  if not auth_owns_customer(p_customer_id) then
    raise exception 'Not allowed';
  end if;

  select merchant_id, branch_id into v_merchant, v_branch from customers where id = p_customer_id;
  select stamps, status, cooldown_until
    into v_stamps, v_status, v_cooldown
    from loyalty_cards where customer_id = p_customer_id;

  if v_status is null then
    raise exception 'Card not found';
  end if;

  if v_status = 'reward_ready' then
    raise exception 'Redeem your current reward with staff before collecting more stamps';
  end if;

  if v_status = 'claimed' then
    select restart_after_reward into v_restart from merchants where id = v_merchant;
    if not coalesce(v_restart, true) then
      raise exception 'This rewards program is complete. Ask the shop if you can start again.';
    end if;
  end if;

  if v_cooldown is not null and v_cooldown > now() then
    raise exception 'Your next stamp card is locked until %',
      to_char(v_cooldown at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM');
  end if;

  -- Clear an expired cooldown so the card is fully unlocked.
  if v_cooldown is not null and v_cooldown <= now() then
    update loyalty_cards
      set cooldown_until = null,
          status = case when status = 'claimed' then 'active'::card_status else status end
      where customer_id = p_customer_id;
  end if;

  if exists (select 1 from approvals where customer_id = p_customer_id and status = 'pending') then
    raise exception 'A stamp request is already pending';
  end if;

  insert into approvals (merchant_id, branch_id, customer_id, stamps_before)
  values (v_merchant, v_branch, p_customer_id, coalesce(v_stamps, 0))
  returning id into v_approval;

  return v_approval;
end; $$;

create or replace function redeem_reward(p_customer_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_status card_status;
  v_restart boolean;
  v_cd_value int;
  v_cd_unit text;
  v_until timestamptz;
begin
  select merchant_id, branch_id, status into v_merchant, v_branch, v_status
  from loyalty_cards where customer_id = p_customer_id;
  if v_merchant is null then raise exception 'Card not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if v_status <> 'reward_ready' then raise exception 'Reward not ready'; end if;

  select
    restart_after_reward,
    reward_cooldown_value,
    reward_cooldown_unit
  into v_restart, v_cd_value, v_cd_unit
  from merchants where id = v_merchant;

  v_until := null;
  if coalesce(v_restart, true) and coalesce(v_cd_value, 0) > 0 then
    v_until := now() + case coalesce(v_cd_unit, 'days')
      when 'hours' then make_interval(hours => v_cd_value)
      when 'weeks' then make_interval(weeks => v_cd_value)
      else make_interval(days => v_cd_value)
    end;
  end if;

  if coalesce(v_restart, true) then
    update loyalty_cards
      set stamps = 0,
          status = 'active',
          reward_code = null,
          cooldown_until = v_until
      where customer_id = p_customer_id;
  else
    update loyalty_cards
      set stamps = 0,
          status = 'claimed',
          reward_code = null,
          cooldown_until = null
      where customer_id = p_customer_id;
  end if;

  insert into redemptions (merchant_id, branch_id, customer_id, code)
  values (v_merchant, v_branch, p_customer_id, p_code);
end; $$;
