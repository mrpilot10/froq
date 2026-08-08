-- AI Menu catalogue: the dishes a guest sees when they scan the table QR.
--
-- Merchant-scoped rather than branch-scoped: outlets of the same brand serve
-- the same menu, and per-branch availability is a later problem than getting a
-- menu in at all. Items carry where they came from (typed in vs read out of an
-- uploaded photo or PDF) so the merchant can tell which rows still need a look.

create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists menu_categories_merchant_name_idx
  on public.menu_categories (merchant_id, lower(name));

create index if not exists menu_categories_merchant_idx
  on public.menu_categories (merchant_id, sort_order, name);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  name text not null,
  description text,
  -- Null = no price on the menu ("market price", "as per weight").
  price numeric(10, 2) check (price is null or price >= 0),
  -- 'veg' | 'vegan' | 'gluten_free' — free-form so a new tag needs no migration.
  diet text[] not null default '{}'::text[],
  -- 'gluten' | 'dairy' | 'nuts' | 'egg' | 'fish' | 'shellfish' | 'soy'
  allergens text[] not null default '{}'::text[],
  spice_level int check (spice_level is null or (spice_level >= 0 and spice_level <= 3)),
  prep_minutes int check (prep_minutes is null or (prep_minutes > 0 and prep_minutes <= 240)),
  is_available boolean not null default true,
  -- 'manual' = typed in, 'ai' = read out of an upload and kept by the merchant.
  source text not null default 'manual' check (source in ('manual', 'ai')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_items_merchant_idx
  on public.menu_items (merchant_id, sort_order, name);

create index if not exists menu_items_category_idx
  on public.menu_items (category_id, sort_order, name);

create or replace function public.menu_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists menu_categories_touch_updated_at_trg on public.menu_categories;
create trigger menu_categories_touch_updated_at_trg
  before update on public.menu_categories
  for each row execute function public.menu_touch_updated_at();

drop trigger if exists menu_items_touch_updated_at_trg on public.menu_items;
create trigger menu_items_touch_updated_at_trg
  before update on public.menu_items
  for each row execute function public.menu_touch_updated_at();

alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;

drop policy if exists menu_categories_select on public.menu_categories;
create policy menu_categories_select on public.menu_categories
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_categories_insert on public.menu_categories;
create policy menu_categories_insert on public.menu_categories
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_categories_update on public.menu_categories;
create policy menu_categories_update on public.menu_categories
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_categories_delete on public.menu_categories;
create policy menu_categories_delete on public.menu_categories
  for delete using (auth_owns_merchant(merchant_id));

drop policy if exists menu_items_select on public.menu_items;
create policy menu_items_select on public.menu_items
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_items_insert on public.menu_items;
create policy menu_items_insert on public.menu_items
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_items_update on public.menu_items;
create policy menu_items_update on public.menu_items
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_items_delete on public.menu_items;
create policy menu_items_delete on public.menu_items
  for delete using (auth_owns_merchant(merchant_id));
