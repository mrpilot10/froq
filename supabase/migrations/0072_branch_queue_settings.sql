-- Per-branch queue store hours + initial wait estimate.
-- Until now hours lived only on `merchants` and the wait estimate was
-- browser-local, so every location shared one schedule / ETA seed.
-- New branches copy these from the main (`is_default`) branch on create.

alter table public.branches
  add column if not exists queue_open_time time without time zone not null default '10:00',
  add column if not exists queue_close_time time without time zone not null default '22:00',
  add column if not exists queue_hours_timezone text not null default 'Asia/Kolkata',
  add column if not exists queue_open_days smallint[] not null default '{0,1,2,3,4,5,6}',
  add column if not exists queue_auto_start boolean not null default true,
  add column if not exists queue_auto_close boolean not null default true,
  add column if not exists estimated_wait_minutes integer not null default 10;

comment on column public.branches.queue_open_time is
  'Local open time for this branch queue auto-start (wall clock in queue_hours_timezone).';
comment on column public.branches.queue_close_time is
  'Local close time for this branch queue auto-close (wall clock in queue_hours_timezone).';
comment on column public.branches.queue_hours_timezone is
  'IANA timezone for interpreting this branch''s queue open/close times.';
comment on column public.branches.queue_open_days is
  'Days this branch runs a queue: 0=Sunday … 6=Saturday.';
comment on column public.branches.queue_auto_start is
  'When true, cron starts a live queue session for this branch near open time.';
comment on column public.branches.queue_auto_close is
  'When true, cron ends this branch''s open queue sessions at/after close time.';
comment on column public.branches.estimated_wait_minutes is
  'Merchant initial minutes-per-party wait estimate for this branch (1–120).';

-- Seed every existing branch from the merchant so current timings carry over.
update public.branches b set
  queue_open_time = m.queue_open_time,
  queue_close_time = m.queue_close_time,
  queue_hours_timezone = m.queue_hours_timezone,
  queue_open_days = m.queue_open_days,
  queue_auto_start = m.queue_auto_start,
  queue_auto_close = m.queue_auto_close
from public.merchants m
where b.merchant_id = m.id;
