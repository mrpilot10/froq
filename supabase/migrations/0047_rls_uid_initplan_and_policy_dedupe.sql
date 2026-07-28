-- SUPERSEDED (partial) — do not re-run standalone.
-- Write-policy splits and auth_owns_* bodies are kept in 0049; SELECT path was
-- replaced by 0048 (auth_user_*_ids InitPlan). Squashed into 0049.
-- Re-running this file against current remote would REWRITE customers_select to
-- auth_owns_merchant(…) and undo 0048's InitPlan form (perf regression; also
-- diverges SELECT vs WRITE membership helpers).
--
-- 0047: RLS InitPlan for auth.uid() + dedupe overlapping FOR ALL SELECT policies.
--
-- Does NOT weaken visibility:
--   visits/redemptions SELECT was (select_pol OR all_pol)
--     = (merchant OR customer) OR merchant  ≡  merchant OR customer
--   After: SELECT uses only the dedicated SELECT policy (same set).
--   Writes remain merchant-only via INSERT/UPDATE/DELETE policies.
--
-- auth_owns_* stay SECURITY DEFINER (INVOKER would recurse via members_select).

-- ─── Helpers: InitPlan-friendly uid ──────────────────────────────────────────
create or replace function auth_owns_merchant(m_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from merchants
    where id = m_id and owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from merchant_members mm
    where mm.merchant_id = m_id and mm.user_id = (select auth.uid())
  );
$$;

create or replace function auth_owns_customer(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from customers
    where id = c_id and user_id = (select auth.uid())
  );
$$;

create or replace function auth_member_role(m_id uuid)
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from merchants
      where id = m_id and owner_user_id = (select auth.uid())
    ) then 'owner'::member_role
    else (
      select role from merchant_members mm
      where mm.merchant_id = m_id and mm.user_id = (select auth.uid())
    )
  end;
$$;

-- ─── visits: FOR ALL included SELECT → duplicate auth_owns_merchant in filter ─
drop policy if exists visits_write on visits;
drop policy if exists visits_insert on visits;
drop policy if exists visits_update on visits;
drop policy if exists visits_delete on visits;
create policy visits_insert on visits
  for insert with check (auth_owns_merchant(merchant_id));
create policy visits_update on visits
  for update
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));
create policy visits_delete on visits
  for delete using (auth_owns_merchant(merchant_id));
-- visits_select unchanged: (auth_owns_merchant OR auth_owns_customer)

-- ─── redemptions: same FOR ALL / SELECT overlap ──────────────────────────────
drop policy if exists redemptions_write on redemptions;
drop policy if exists redemptions_insert on redemptions;
drop policy if exists redemptions_update on redemptions;
drop policy if exists redemptions_delete on redemptions;
create policy redemptions_insert on redemptions
  for insert with check (auth_owns_merchant(merchant_id));
create policy redemptions_update on redemptions
  for update
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));
create policy redemptions_delete on redemptions
  for delete using (auth_owns_merchant(merchant_id));

-- ─── loyalty_cards: FOR ALL duplicated the SELECT qual ───────────────────────
drop policy if exists cards_write on loyalty_cards;
drop policy if exists cards_insert on loyalty_cards;
drop policy if exists cards_update on loyalty_cards;
drop policy if exists cards_delete on loyalty_cards;
create policy cards_insert on loyalty_cards
  for insert
  with check (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));
create policy cards_update on loyalty_cards
  for update
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id))
  with check (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));
create policy cards_delete on loyalty_cards
  for delete
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

-- ─── Bare auth.uid() in policies → (select auth.uid()) ───────────────────────
drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists customers_insert on customers;
create policy customers_insert on customers for insert
  with check (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists customers_update on customers;
create policy customers_update on customers for update
  using (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  )
  with check (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists customers_delete on customers;
create policy customers_delete on customers for delete
  using (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists merchants_insert on merchants;
create policy merchants_insert on merchants for insert
  with check (owner_user_id = (select auth.uid()));

drop policy if exists merchants_update on merchants;
create policy merchants_update on merchants for update
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists merchants_delete on merchants;
create policy merchants_delete on merchants for delete
  using (owner_user_id = (select auth.uid()));

drop policy if exists members_write on merchant_members;
create policy members_write on merchant_members for all
  using (
    exists (
      select 1 from merchants
      where id = merchant_id and owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from merchants
      where id = merchant_id and owner_user_id = (select auth.uid())
    )
  );

drop policy if exists merchant_products_owner_all on merchant_products;
create policy merchant_products_owner_all on merchant_products for all
  using (
    exists (
      select 1 from merchants m
      where m.id = merchant_products.merchant_id
        and m.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from merchants m
      where m.id = merchant_products.merchant_id
        and m.owner_user_id = (select auth.uid())
    )
  );
