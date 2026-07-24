-- Per-merchant product entitlements + owner name.
-- A merchant can own multiple Froq products (loyalty, queue), each billed and
-- onboarded separately. `onboarded_at` is null until that product's onboarding
-- block is finished.

-- Owner name (universal, collected during global onboarding).
alter table merchants
  add column if not exists owner_first_name text,
  add column if not exists owner_last_name  text;

-- Enums
do $$ begin
  create type merchant_product as enum ('loyalty', 'queue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_status as enum ('active', 'past_due', 'canceled');
exception when duplicate_object then null; end $$;

-- Entitlement rows
create table if not exists merchant_products (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants (id) on delete cascade,
  product      merchant_product not null,
  plan_id      text,
  status       product_status not null default 'active',
  purchased_at timestamptz not null default now(),
  onboarded_at timestamptz,
  unique (merchant_id, product)
);
create index if not exists merchant_products_merchant_idx
  on merchant_products (merchant_id);

-- RLS: a merchant owner can see and manage only their own product rows.
alter table merchant_products enable row level security;

do $$ begin
  create policy merchant_products_owner_all on merchant_products
    for all
    using (
      exists (
        select 1 from merchants m
        where m.id = merchant_products.merchant_id
          and m.owner_user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from merchants m
        where m.id = merchant_products.merchant_id
          and m.owner_user_id = auth.uid()
      )
    );
exception when duplicate_object then null; end $$;
