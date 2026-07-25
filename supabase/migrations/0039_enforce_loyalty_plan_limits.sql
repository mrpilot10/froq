-- Enforce loyalty plan customer caps inside join_merchant (new customers only).
-- Re-joins / existing phone matches are unchanged.

create or replace function join_merchant(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_branch text default null
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

  insert into customers (merchant_id, branch_id, user_id, name, phone, email)
  values (v_merchant, v_branch, auth.uid(), p_name, p_phone, nullif(trim(p_email), ''))
  on conflict (merchant_id, phone)
  do update set
    user_id = excluded.user_id,
    name = excluded.name,
    email = coalesce(excluded.email, customers.email),
    branch_id = coalesce(excluded.branch_id, customers.branch_id)
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id, branch_id)
  values (v_customer, v_merchant, v_branch)
  on conflict (customer_id) do nothing;

  return v_customer;
end;
$$;
