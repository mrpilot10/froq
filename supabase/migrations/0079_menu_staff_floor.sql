-- Floor board for AI Menu: guest "Need something?" requests, and a confirm
-- step before a round goes to the kitchen.
--
-- Order lifecycle (was placed → served):
--   pending   = guest submitted, waiting for a server to confirm
--   confirmed = server confirmed the dishes with the table
--   kitchen   = sent to the kitchen
--   served    = on the table
--   cancelled = struck off
--
-- Existing `placed` rows already meant "in the kitchen", so they move to
-- `kitchen` before the check constraint tightens.

alter table public.menu_orders
  drop constraint if exists menu_orders_status_check;

update public.menu_orders
set status = 'kitchen'
where status = 'placed';

alter table public.menu_orders
  alter column status set default 'pending';

alter table public.menu_orders
  add constraint menu_orders_status_check
  check (status in ('pending', 'confirmed', 'kitchen', 'served', 'cancelled'));

comment on column public.menu_orders.status is
  'pending → confirmed → kitchen → served (or cancelled).';

-- ---------------------------------------------------------------------------
-- Staff requests from the guest "Need something?" sheet
-- ---------------------------------------------------------------------------

create table if not exists public.menu_staff_requests (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants (id) on delete cascade,
  branch_id        uuid not null references public.branches (id) on delete cascade,
  -- Null when the guest never checked in; table_number still names the table.
  session_id       uuid references public.menu_dining_sessions (id) on delete set null,
  dining_table_id  uuid references public.dining_tables (id) on delete set null,
  table_number     int,
  table_label      text,
  -- Stable key from the guest sheet ("Water refill"), plus the label shown.
  reason_key       text not null,
  reason_label     text not null,
  -- Auto-assigned to the least-busy on-floor teammate at create time.
  assigned_to      uuid references public.merchant_members (id) on delete set null,
  -- open = waiting, acked = server saw it, done = handled, cancelled = dropped.
  status           text not null default 'open'
                   check (status in ('open', 'acked', 'done', 'cancelled')),
  created_at       timestamptz not null default now(),
  assigned_at      timestamptz,
  acked_at         timestamptz,
  completed_at     timestamptz,
  updated_at       timestamptz not null default now()
);

create index if not exists menu_staff_requests_branch_open_idx
  on public.menu_staff_requests (branch_id, status, created_at desc);

create index if not exists menu_staff_requests_assigned_idx
  on public.menu_staff_requests (assigned_to, status, created_at desc)
  where assigned_to is not null;

create index if not exists menu_staff_requests_merchant_idx
  on public.menu_staff_requests (merchant_id, created_at desc);

create trigger menu_staff_requests_touch_updated_at
  before update on public.menu_staff_requests
  for each row execute function public.menu_history_touch_updated_at();

alter table public.menu_staff_requests enable row level security;

drop policy if exists menu_staff_requests_select on public.menu_staff_requests;
create policy menu_staff_requests_select on public.menu_staff_requests
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_staff_requests_insert on public.menu_staff_requests;
create policy menu_staff_requests_insert on public.menu_staff_requests
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_staff_requests_update on public.menu_staff_requests;
create policy menu_staff_requests_update on public.menu_staff_requests
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_staff_requests_delete on public.menu_staff_requests;
create policy menu_staff_requests_delete on public.menu_staff_requests
  for delete using (auth_owns_merchant(merchant_id));

comment on table public.menu_staff_requests is
  'Guest Need something? calls, auto-assigned to floor staff.';
