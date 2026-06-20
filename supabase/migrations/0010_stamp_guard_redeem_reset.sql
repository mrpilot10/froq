-- Block stamp requests while a reward is waiting to be redeemed, and reset the
-- card to active (new cycle) once the merchant marks the reward as claimed.

create or replace function request_stamp(p_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_stamps int;
  v_status card_status;
  v_approval uuid;
begin
  if not auth_owns_customer(p_customer_id) then
    raise exception 'Not allowed';
  end if;

  select merchant_id into v_merchant from customers where id = p_customer_id;
  select stamps, status into v_stamps, v_status
  from loyalty_cards where customer_id = p_customer_id;

  if v_status = 'reward_ready' then
    raise exception 'Redeem your current reward with staff before collecting more stamps';
  end if;

  if exists (select 1 from approvals where customer_id = p_customer_id and status = 'pending') then
    raise exception 'A stamp request is already pending';
  end if;

  insert into approvals (merchant_id, customer_id, stamps_before)
  values (v_merchant, p_customer_id, coalesce(v_stamps, 0))
  returning id into v_approval;

  return v_approval;
end; $$;

create or replace function redeem_reward(p_customer_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_status card_status;
begin
  select merchant_id, status into v_merchant, v_status
  from loyalty_cards where customer_id = p_customer_id;
  if v_merchant is null then raise exception 'Card not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if v_status <> 'reward_ready' then raise exception 'Reward not ready'; end if;

  update loyalty_cards set stamps = 0, status = 'active' where customer_id = p_customer_id;
  insert into redemptions (merchant_id, customer_id, code)
  values (v_merchant, p_customer_id, p_code);
end; $$;

drop policy if exists customers_delete on customers;
create policy customers_delete on customers for delete
  using (auth_owns_merchant(merchant_id) or user_id = auth.uid());
