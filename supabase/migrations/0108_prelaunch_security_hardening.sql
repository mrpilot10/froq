-- Pre-launch security hardening:
-- 1. Customers must not write loyalty_cards (stamps / status) via the Data API.
--    Stamp mutations go through SECURITY DEFINER RPCs (bypass RLS).
-- 2. Customers must not change tenant, ban, identity, or hub token columns.
-- 3. merchants / branches are no longer world-readable (owner + staff only).
--    Guest pages already use the service-role client for public shop data.
-- 4. invite_token is hidden from authenticated PostgREST (lookup uses service role).

-- ─── Loyalty cards: merchant (owner/staff) writes only ───────────────────────
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

-- ─── Customers: lock tenant / ban / token / user_id for self-service updates ─
create or replace function public.customers_protect_sensitive_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service-role (admin client + SECURITY DEFINER inner writes that run as
  -- the definer) may change anything. Authenticated merchants may too.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if auth_owns_merchant(old.merchant_id) then
    return new;
  end if;

  -- The signed-in customer may update profile fields only.
  new.merchant_id := old.merchant_id;
  new.user_id := old.user_id;
  new.public_token := old.public_token;
  new.banned := old.banned;
  return new;
end;
$$;

drop trigger if exists customers_protect_sensitive_columns_bu on public.customers;
create trigger customers_protect_sensitive_columns_bu
  before update on public.customers
  for each row
  execute function public.customers_protect_sensitive_columns();

-- ─── Merchants / branches: stop dumping every tenant to anon+authenticated ───
drop policy if exists merchants_read on public.merchants;
create policy merchants_select_member on public.merchants
  for select
  using (auth_owns_merchant(id));

drop policy if exists branches_read on public.branches;
create policy branches_select_member on public.branches
  for select
  using (auth_owns_merchant(merchant_id));

-- ─── Hide invite tokens from the Data API (accept-invite uses service role) ──
revoke select (invite_token) on public.merchant_members from anon, authenticated;
