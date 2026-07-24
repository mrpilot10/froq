-- Enforce cooldown / restart rules on merchant stamp approval.
-- Previously only request_stamp and offer_stamp checked cooldown_until, so approving
-- a pending request (or a stale one after redeem) could refill the card and mint a
-- reward QR during the wait window. Also cancel pending approvals on redeem.

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
begin
  select a.merchant_id, a.customer_id, a.branch_id into v_merchant, v_customer, v_branch
  from approvals a where a.id = p_approval_id and a.status = 'pending';
  if v_merchant is null then
    raise exception 'Approval not found';
  end if;
  if not auth_owns_merchant(v_merchant) then
    raise exception 'Not allowed';
  end if;

  select lc.stamps, lc.status, lc.cooldown_until
    into v_stamps, v_status, v_cooldown
  from loyalty_cards lc
  where lc.customer_id = v_customer;

  if v_status is null then
    raise exception 'Loyalty card not found';
  end if;

  if v_status = 'reward_ready' then
    raise exception 'Redeem their current reward before approving another stamp';
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
      where customer_id = v_customer;
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

  insert into visits (customer_id, merchant_id, branch_id, amount)
  values (v_customer, v_merchant, v_branch, coalesce(v_aov, 0));

  update approvals set status = 'approved', resolved_at = now() where id = p_approval_id;
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

  -- Drop any stamp requests that would bypass the new cooldown window.
  update approvals
    set status = 'rejected', resolved_at = now()
    where customer_id = p_customer_id and status = 'pending';

  insert into redemptions (merchant_id, branch_id, customer_id, code)
  values (v_merchant, v_branch, p_customer_id, p_code);
end; $$;
