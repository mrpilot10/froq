-- Queue store hours + auto session start/close (merchant-level).
-- Times are wall-clock in queue_hours_timezone; days use JS getDay() (0=Sun … 6=Sat).

alter table public.merchants
  add column if not exists queue_open_time time without time zone not null default '10:00',
  add column if not exists queue_close_time time without time zone not null default '22:00',
  add column if not exists queue_hours_timezone text not null default 'Asia/Kolkata',
  add column if not exists queue_open_days smallint[] not null default '{0,1,2,3,4,5,6}',
  add column if not exists queue_auto_start boolean not null default false,
  add column if not exists queue_auto_close boolean not null default true;

comment on column public.merchants.queue_open_time is
  'Local open time for queue auto-start (wall clock in queue_hours_timezone).';
comment on column public.merchants.queue_close_time is
  'Local close time for queue auto-close (wall clock in queue_hours_timezone).';
comment on column public.merchants.queue_hours_timezone is
  'IANA timezone for interpreting queue open/close times.';
comment on column public.merchants.queue_open_days is
  'Days the store runs a queue: 0=Sunday … 6=Saturday.';
comment on column public.merchants.queue_auto_start is
  'When true, cron starts a live queue session near open time.';
comment on column public.merchants.queue_auto_close is
  'When true (recommended), cron ends open queue sessions at/after close time.';
