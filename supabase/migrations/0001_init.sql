-- Froq SaaS — initial schema
-- Multi-tenant loyalty platform. A "merchant" is one shop (a tenant).
-- Run in the Supabase SQL editor or via the Supabase CLI.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type card_status as enum ('active', 'reward_ready', 'claimed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists merchants (
  id                     uuid primary key default gen_random_uuid(),
  owner_user_id          uuid not null references auth.users (id) on delete cascade,
  business_name          text not null,
  short_name             text not null,
  slug                   text not null unique,
  email                  text,
  phone                  text,
  address                text,
  brand_color            text not null default '#2b6f5c',
  logo_url               text,
  website_url            text,
  google_business_url    text,
  instagram_url          text,
  facebook_url           text,
  x_url                  text,
  reward_title           text not null default 'Free reward',
  reward_name            text not null default 'Reward',
  total_stamps           int  not null default 8 check (total_stamps between 1 and 20),
  avg_order_value        numeric not null default 0 check (avg_order_value >= 0),
  stamp_notifications    boolean not null default true,
  approval_notifications boolean not null default true,
  marketing_emails       boolean not null default false,
  created_at             timestamptz not null default now()
);
create index if not exists merchants_owner_idx on merchants (owner_user_id);

create table if not exists customers (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references merchants (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  name         text not null,
  phone        text not null,
  email        text,
  banned       boolean not null default false,
  member_since timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (merchant_id, phone)
);
create index if not exists customers_merchant_idx on customers (merchant_id);
create index if not exists customers_user_idx on customers (user_id);

create table if not exists loyalty_cards (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  merchant_id uuid not null references merchants (id) on delete cascade,
  stamps      int  not null default 0 check (stamps >= 0),
  status      card_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (customer_id)
);
create index if not exists cards_merchant_idx on loyalty_cards (merchant_id);

create table if not exists visits (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  merchant_id uuid not null references merchants (id) on delete cascade,
  amount      numeric not null default 0 check (amount >= 0),
  created_at  timestamptz not null default now()
);
create index if not exists visits_merchant_idx on visits (merchant_id);
create index if not exists visits_created_idx on visits (merchant_id, created_at);

create table if not exists approvals (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references merchants (id) on delete cascade,
  customer_id   uuid not null references customers (id) on delete cascade,
  stamps_before int  not null default 0,
  status        approval_status not null default 'pending',
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists approvals_merchant_idx on approvals (merchant_id, status);

create table if not exists redemptions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  code        text not null,
  redeemed_at timestamptz not null default now(),
  unique (merchant_id, code)
);
create index if not exists redemptions_merchant_idx on redemptions (merchant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Helpers (security definer so policies can call them without recursion)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function auth_owns_merchant(m_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from merchants
    where id = m_id and owner_user_id = auth.uid()
  );
$$;

create or replace function auth_owns_customer(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from customers
    where id = c_id and user_id = auth.uid()
  );
$$;

-- keep updated_at fresh on loyalty_cards
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists loyalty_cards_touch on loyalty_cards;
create trigger loyalty_cards_touch before update on loyalty_cards
  for each row execute function touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Stats view (security_invoker so the caller's RLS applies)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view merchant_stats with (security_invoker = on) as
  select
    m.id as merchant_id,
    (select count(*) from customers c where c.merchant_id = m.id and not c.banned) as total_customers,
    (select count(*) from loyalty_cards lc where lc.merchant_id = m.id and lc.status = 'active') as active_cards,
    (select count(*) from visits v where v.merchant_id = m.id and v.created_at >= date_trunc('day', now())) as stamps_today,
    (select count(*) from approvals a where a.merchant_id = m.id and a.status = 'pending') as pending_approvals,
    (select count(*) from redemptions r where r.merchant_id = m.id) as rewards_redeemed,
    coalesce((
      select avg(cnt) from (
        select count(*) cnt from visits v where v.merchant_id = m.id group by v.customer_id
      ) per_customer
    ), 0) as avg_lifetime_visits
  from merchants m;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table merchants     enable row level security;
alter table customers     enable row level security;
alter table loyalty_cards enable row level security;
alter table visits        enable row level security;
alter table approvals     enable row level security;
alter table redemptions   enable row level security;

-- merchants: public can read shop info (needed for the QR join page); owner manages.
drop policy if exists merchants_read on merchants;
create policy merchants_read on merchants for select using (true);

drop policy if exists merchants_insert on merchants;
create policy merchants_insert on merchants for insert
  with check (owner_user_id = auth.uid());

drop policy if exists merchants_update on merchants;
create policy merchants_update on merchants for update
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists merchants_delete on merchants;
create policy merchants_delete on merchants for delete
  using (owner_user_id = auth.uid());

-- customers: merchant owner manages their tenant's customers; a logged-in
-- customer can read their own row and self-enroll (join).
drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (auth_owns_merchant(merchant_id) or user_id = auth.uid());

drop policy if exists customers_insert on customers;
create policy customers_insert on customers for insert
  with check (auth_owns_merchant(merchant_id) or user_id = auth.uid());

drop policy if exists customers_update on customers;
create policy customers_update on customers for update
  using (auth_owns_merchant(merchant_id) or user_id = auth.uid())
  with check (auth_owns_merchant(merchant_id) or user_id = auth.uid());

drop policy if exists customers_delete on customers;
create policy customers_delete on customers for delete
  using (auth_owns_merchant(merchant_id));

-- loyalty_cards
drop policy if exists cards_select on loyalty_cards;
create policy cards_select on loyalty_cards for select
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

drop policy if exists cards_write on loyalty_cards;
create policy cards_write on loyalty_cards for all
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id))
  with check (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

-- visits (only the merchant records visits / stamps)
drop policy if exists visits_select on visits;
create policy visits_select on visits for select
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

drop policy if exists visits_write on visits;
create policy visits_write on visits for all
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));

-- approvals: customer can request (insert) for themselves; merchant resolves.
drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals for select
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

drop policy if exists approvals_insert on approvals;
create policy approvals_insert on approvals for insert
  with check (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

drop policy if exists approvals_update on approvals;
create policy approvals_update on approvals for update
  using (auth_owns_merchant(merchant_id)) with check (auth_owns_merchant(merchant_id));

-- redemptions (merchant marks rewards claimed)
drop policy if exists redemptions_select on redemptions;
create policy redemptions_select on redemptions for select
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

drop policy if exists redemptions_write on redemptions;
create policy redemptions_write on redemptions for all
  using (auth_owns_merchant(merchant_id)) with check (auth_owns_merchant(merchant_id));
