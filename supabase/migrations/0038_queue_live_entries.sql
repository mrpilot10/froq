-- Live queue sessions + entries so QR joins appear on the merchant board.

do $$ begin
  create type queue_session_status as enum ('live', 'paused', 'ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type queue_entry_status as enum ('waiting', 'called', 'seated', 'left');
exception when duplicate_object then null; end $$;

do $$ begin
  create type queue_entry_kind as enum ('walkin', 'reservation');
exception when duplicate_object then null; end $$;

create table if not exists queue_sessions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  branch_id   uuid references branches (id) on delete set null,
  number      int  not null check (number >= 1),
  status      queue_session_status not null default 'live',
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- At most one open (live/paused) session per merchant + branch.
create unique index if not exists queue_sessions_one_open_idx
  on queue_sessions (
    merchant_id,
    (coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  where status in ('live', 'paused');

create index if not exists queue_sessions_merchant_idx
  on queue_sessions (merchant_id, started_at desc);

create table if not exists queue_entries (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        uuid not null references merchants (id) on delete cascade,
  session_id         uuid not null references queue_sessions (id) on delete cascade,
  branch_id          uuid references branches (id) on delete set null,
  customer_id        uuid references customers (id) on delete set null,
  name               text not null,
  phone              text not null,
  email              text,
  party_size         int  not null check (party_size >= 1),
  kind               queue_entry_kind not null default 'walkin',
  status             queue_entry_status not null default 'waiting',
  reservation_time   text,
  joined_at          timestamptz not null default now(),
  called_at          timestamptz,
  accept_by          timestamptz,
  seated_at          timestamptz,
  left_at            timestamptz,
  notified_joined_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists queue_entries_session_status_idx
  on queue_entries (session_id, status, joined_at);

create index if not exists queue_entries_merchant_open_idx
  on queue_entries (merchant_id, status)
  where status in ('waiting', 'called');

create or replace function queue_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists queue_sessions_updated_at on queue_sessions;
create trigger queue_sessions_updated_at
  before update on queue_sessions
  for each row execute function queue_touch_updated_at();

drop trigger if exists queue_entries_updated_at on queue_entries;
create trigger queue_entries_updated_at
  before update on queue_entries
  for each row execute function queue_touch_updated_at();

alter table queue_sessions enable row level security;
alter table queue_entries enable row level security;

drop policy if exists queue_sessions_select on queue_sessions;
create policy queue_sessions_select on queue_sessions
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists queue_sessions_insert on queue_sessions;
create policy queue_sessions_insert on queue_sessions
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists queue_sessions_update on queue_sessions;
create policy queue_sessions_update on queue_sessions
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists queue_entries_select on queue_entries;
create policy queue_entries_select on queue_entries
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists queue_entries_insert on queue_entries;
create policy queue_entries_insert on queue_entries
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists queue_entries_update on queue_entries;
create policy queue_entries_update on queue_entries
  for update using (auth_owns_merchant(merchant_id));
