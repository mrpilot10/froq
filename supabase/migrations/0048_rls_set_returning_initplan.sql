-- 0048: Zero-arg set-returning auth helpers so RLS quals become InitPlans.
--
-- auth_owns_merchant(column) is STABLE but the COLUMN arg varies per row, so
-- Postgres still invokes it ~N times. Rewrite SELECT policies to:
--   merchant_id = any (select auth_user_merchant_ids())
-- which evaluates the set once (InitPlan) and probes membership.
--
-- AUTHORIZATION PATH SPLIT (must stay equivalent):
--   SELECT  → auth_user_merchant_ids() / auth_user_customer_ids()
--             (zero-arg set-returning; InitPlan-friendly)
--   WRITE   → auth_owns_merchant(col) / auth_owns_customer(col)
--             (kept for insert/update/delete policies + plpgsql scalar checks)
--
-- These two forms are semantically equivalent today:
--   auth_owns_merchant(m)  ⇔  m = any (select auth_user_merchant_ids())
--   auth_owns_customer(c)  ⇔  c = any (select auth_user_customer_ids())
-- Any change to membership rules in ONE path MUST be mirrored in the other.
-- A future divergence is a security bug (over- or under-grant), not just a
-- perf regression.
--
-- Keep auth_owns_merchant / auth_owns_customer for plpgsql callers that pass
-- a scalar (v_merchant, p_customer_id, etc.).
--
-- SECURITY DEFINER + force_rls=false on merchants/merchant_members/customers
-- → helpers bypass those tables' RLS; no recursion into auth_owns_*.

create or replace function auth_user_merchant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from merchants
  where owner_user_id = (select auth.uid())
  union
  select merchant_id
  from merchant_members
  where user_id = (select auth.uid());
$$;

create or replace function auth_user_customer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from customers
  where user_id = (select auth.uid());
$$;

grant execute on function auth_user_merchant_ids() to authenticated;
grant execute on function auth_user_customer_ids() to authenticated;

-- ─── SELECT policies: column-arg auth_owns_* → InitPlan ANY ──────────────────

drop policy if exists visits_select on visits;
create policy visits_select on visits for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists redemptions_select on redemptions;
create policy redemptions_select on redemptions for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists cards_select on loyalty_cards;
create policy cards_select on loyalty_cards for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or user_id = (select auth.uid())
  );

drop policy if exists members_select on merchant_members;
create policy members_select on merchant_members for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists queue_call_jobs_select on queue_call_jobs;
create policy queue_call_jobs_select on queue_call_jobs for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists queue_sessions_select on queue_sessions;
create policy queue_sessions_select on queue_sessions for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists queue_entries_select on queue_entries;
create policy queue_entries_select on queue_entries for select
  using (merchant_id = any (select auth_user_merchant_ids()));
