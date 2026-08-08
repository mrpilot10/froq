-- Table offers shown on the guest AI Menu offers sheet.
-- Merchant-scoped: every branch of a brand shares the same promos.

create table if not exists public.menu_offers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  -- Short ticket label, e.g. "20% OFF" or "₹99 FLAT".
  badge text not null,
  title text not null,
  detail text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_offers_badge_len check (char_length(badge) between 1 and 24),
  constraint menu_offers_title_len check (char_length(title) between 1 and 80),
  constraint menu_offers_detail_len check (char_length(detail) <= 160)
);

create index if not exists menu_offers_merchant_idx
  on public.menu_offers (merchant_id, sort_order, created_at);

drop trigger if exists menu_offers_touch_updated_at_trg on public.menu_offers;
create trigger menu_offers_touch_updated_at_trg
  before update on public.menu_offers
  for each row execute function public.menu_touch_updated_at();

alter table public.menu_offers enable row level security;

drop policy if exists menu_offers_select on public.menu_offers;
create policy menu_offers_select on public.menu_offers
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_offers_insert on public.menu_offers;
create policy menu_offers_insert on public.menu_offers
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_offers_update on public.menu_offers;
create policy menu_offers_update on public.menu_offers
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_offers_delete on public.menu_offers;
create policy menu_offers_delete on public.menu_offers
  for delete using (auth_owns_merchant(merchant_id));

comment on table public.menu_offers is
  'Guest AI Menu promo cards — managed under AI Menu → Offers.';
