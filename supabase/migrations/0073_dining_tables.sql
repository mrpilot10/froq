-- Branch-level dining table inventory — shared by Waitlist, Reservations, and
-- future floor / occupancy / QR features. Config (seats × quantity) lives on
-- `branches.table_layout`; generated rows live in `dining_tables`.

alter table public.branches
  add column if not exists table_layout jsonb not null default '[]'::jsonb;

comment on column public.branches.table_layout is
  'Merchant config rows [{ "seats": 2, "quantity": 6 }, …] used to regenerate dining_tables.';

create table if not exists public.dining_tables (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  branch_id    uuid not null references public.branches (id) on delete cascade,
  table_number int  not null check (table_number >= 1),
  seats        int  not null check (seats >= 1 and seats <= 50),
  /** Soft label for floor plans later ("Patio 1"); null = "Table N". */
  label        text,
  /** active | inactive — inactive stays in inventory but is not assignable. */
  status       text not null default 'active'
               check (status in ('active', 'inactive')),
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (branch_id, table_number)
);

create index if not exists dining_tables_branch_idx
  on public.dining_tables (branch_id, sort_order, table_number);

create index if not exists dining_tables_merchant_idx
  on public.dining_tables (merchant_id);

comment on table public.dining_tables is
  'Per-branch table inventory. Single source of truth for waitlist + reservations.';

create or replace function public.dining_tables_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dining_tables_touch_updated_at_trg on public.dining_tables;
create trigger dining_tables_touch_updated_at_trg
  before update on public.dining_tables
  for each row execute function public.dining_tables_touch_updated_at();

alter table public.dining_tables enable row level security;

drop policy if exists dining_tables_select on public.dining_tables;
create policy dining_tables_select on public.dining_tables
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists dining_tables_insert on public.dining_tables;
create policy dining_tables_insert on public.dining_tables
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists dining_tables_update on public.dining_tables;
create policy dining_tables_update on public.dining_tables
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists dining_tables_delete on public.dining_tables;
create policy dining_tables_delete on public.dining_tables
  for delete using (auth_owns_merchant(merchant_id));

-- Queue + reservation assignment pointers (nullable until a table is chosen).
alter table public.queue_entries
  add column if not exists dining_table_id uuid references public.dining_tables (id) on delete set null,
  add column if not exists table_number int;

alter table public.reservations
  add column if not exists dining_table_id uuid references public.dining_tables (id) on delete set null,
  add column if not exists table_number int;

create index if not exists queue_entries_dining_table_idx
  on public.queue_entries (dining_table_id)
  where dining_table_id is not null;

create index if not exists reservations_dining_table_idx
  on public.reservations (dining_table_id, reservation_date)
  where dining_table_id is not null;

-- Merchant preference: auto-pick a free table when confirming a booking.
alter table public.merchants
  add column if not exists reservation_auto_assign_tables boolean not null default false;

comment on column public.merchants.reservation_auto_assign_tables is
  'When true, confirming a reservation assigns the best free table for the party size.';
