-- Per-reminder scheduled_at so cron can recover missed sends with:
--   scheduled_at <= now() AND sent_at IS NULL AND status = 'called'

alter table queue_call_jobs
  add column if not exists reminder_1_scheduled_at timestamptz,
  add column if not exists reminder_2_scheduled_at timestamptz,
  add column if not exists reminder_3_scheduled_at timestamptz;

-- Backfill from called_at + fixed offsets (3 / 7 / 9 minutes).
update queue_call_jobs
set
  reminder_1_scheduled_at = coalesce(
    reminder_1_scheduled_at,
    called_at + interval '3 minutes'
  ),
  reminder_2_scheduled_at = coalesce(
    reminder_2_scheduled_at,
    called_at + interval '7 minutes'
  ),
  reminder_3_scheduled_at = coalesce(
    reminder_3_scheduled_at,
    called_at + interval '9 minutes'
  )
where
  reminder_1_scheduled_at is null
  or reminder_2_scheduled_at is null
  or reminder_3_scheduled_at is null;

alter table queue_call_jobs
  alter column reminder_1_scheduled_at set not null,
  alter column reminder_2_scheduled_at set not null,
  alter column reminder_3_scheduled_at set not null;

-- Due-reminder scans (missed cron recovery).
create index if not exists queue_call_jobs_due_r1_idx
  on queue_call_jobs (reminder_1_scheduled_at)
  where status = 'called' and reminder_1_sent_at is null;

create index if not exists queue_call_jobs_due_r2_idx
  on queue_call_jobs (reminder_2_scheduled_at)
  where status = 'called' and reminder_2_sent_at is null;

create index if not exists queue_call_jobs_due_r3_idx
  on queue_call_jobs (reminder_3_scheduled_at)
  where status = 'called' and reminder_3_sent_at is null;
