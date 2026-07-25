-- Queue call reminder jobs.
-- Tracks a "called" party so WhatsApp/SMS reminders can fire at +3 / +7 / +9
-- minutes via cron, with status + per-reminder timestamps for idempotency.

do $$ begin
  create type queue_call_status as enum ('called', 'seated', 'skipped', 'left');
exception when duplicate_object then null; end $$;

create table if not exists queue_call_jobs (
  id                   uuid primary key default gen_random_uuid(),
  merchant_id          uuid not null references merchants (id) on delete cascade,
  branch_id            uuid references branches (id) on delete set null,
  -- Correlates with the merchant UI entry id (localStorage mock → future DB).
  client_entry_id      text not null,
  customer_id          uuid references customers (id) on delete set null,
  customer_name        text not null,
  customer_phone       text not null,
  party_size           int  not null check (party_size >= 1),
  status               queue_call_status not null default 'called',
  called_at            timestamptz not null default now(),
  -- Idempotent delivery markers (null = not sent yet).
  called_notified_at   timestamptz,
  reminder_1_sent_at   timestamptz,
  reminder_2_sent_at   timestamptz,
  reminder_3_sent_at   timestamptz,
  resolved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (merchant_id, client_entry_id)
);

create index if not exists queue_call_jobs_merchant_idx
  on queue_call_jobs (merchant_id);

-- Cron scans open "called" jobs by called_at.
create index if not exists queue_call_jobs_open_called_idx
  on queue_call_jobs (called_at)
  where status = 'called';

create or replace function queue_call_jobs_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists queue_call_jobs_updated_at on queue_call_jobs;
create trigger queue_call_jobs_updated_at
  before update on queue_call_jobs
  for each row
  execute function queue_call_jobs_touch_updated_at();

alter table queue_call_jobs enable row level security;

-- Team members can manage call jobs for their merchant.
drop policy if exists queue_call_jobs_select on queue_call_jobs;
create policy queue_call_jobs_select on queue_call_jobs
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists queue_call_jobs_insert on queue_call_jobs;
create policy queue_call_jobs_insert on queue_call_jobs
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists queue_call_jobs_update on queue_call_jobs;
create policy queue_call_jobs_update on queue_call_jobs
  for update using (auth_owns_merchant(merchant_id));
