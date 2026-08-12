-- Safe subset of 0108 + 0109 that current production can run.
-- Skipped until matching app code is deployed:
--   * merchants/branches member-only SELECT (public join still uses the user client)
--   * REVOKE invite_token (dashboard still select('*') on merchant_members)
--   * drop merchant_products owner writes (checkout still updates via RLS)

-- ─── Loyalty cards: guest Data API must not write stamps ─────────────────────
drop policy if exists cards_insert on public.loyalty_cards;
drop policy if exists cards_update on public.loyalty_cards;
drop policy if exists cards_delete on public.loyalty_cards;

create policy cards_insert on public.loyalty_cards
  for insert
  with check (auth_owns_merchant(merchant_id));

create policy cards_update on public.loyalty_cards
  for update
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));

create policy cards_delete on public.loyalty_cards
  for delete
  using (auth_owns_merchant(merchant_id));

-- ─── Join: never steal another account's customer row ────────────────────────
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
  v_auth_phone text;
  v_input_phone text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_input_phone := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  v_auth_phone := right(
    regexp_replace(
      coalesce(
        nullif(trim(both from coalesce(auth.jwt() ->> 'phone', '')), ''),
        nullif(trim(both from coalesce((auth.jwt() -> 'user_metadata') ->> 'phone', '')), '')
      ),
      '\D',
      '',
      'g'
    ),
    10
  );

  if v_auth_phone is not null and v_auth_phone <> '' and v_auth_phone <> v_input_phone then
    raise exception 'Phone does not match your account';
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
  where customers.user_id is null
     or customers.user_id = excluded.user_id
  returning id into v_customer;

  if v_customer is null then
    raise exception 'This number is already linked to another account.';
  end if;

  insert into loyalty_cards (customer_id, merchant_id, branch_id)
  values (v_customer, v_merchant, v_branch)
  on conflict (customer_id) do nothing;

  return v_customer;
end;
$$;

-- ─── Pending invites are not members yet ─────────────────────────────────────
create or replace function public.auth_owns_merchant(m_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from merchants
    where id = m_id and owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from merchant_members mm
    where mm.merchant_id = m_id
      and mm.user_id = (select auth.uid())
      and mm.accepted_at is not null
  );
$fn$;

update merchant_members
set accepted_at = coalesce(accepted_at, created_at)
where user_id is not null
  and accepted_at is null
  and invite_token is null;

-- ─── Approvals: customer inserts stay in their own tenant ────────────────────
drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert
  with check (
    auth_owns_merchant(merchant_id)
    or (
      auth_owns_customer(customer_id)
      and exists (
        select 1
        from public.customers c
        where c.id = customer_id
          and c.merchant_id = approvals.merchant_id
          and c.user_id = (select auth.uid())
      )
    )
  );

-- ─── Lock tenant / token / ban / merchant notes on self-service updates ──────
create or replace function public.customers_protect_sensitive_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if auth_owns_merchant(old.merchant_id) then
    return new;
  end if;

  new.merchant_id := old.merchant_id;
  new.user_id := old.user_id;
  new.public_token := old.public_token;
  new.banned := old.banned;
  new.merchant_notes := old.merchant_notes;
  return new;
end;
$$;

drop trigger if exists customers_protect_sensitive_columns_bu on public.customers;
create trigger customers_protect_sensitive_columns_bu
  before update on public.customers
  for each row
  execute function public.customers_protect_sensitive_columns();
