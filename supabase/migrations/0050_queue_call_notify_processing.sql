-- Separate in-flight processing from successful delivery for queue_call_now.
-- called_notified_at = WhatsApp delivered successfully (never cleared by cron).
-- call_notify_processing_at = worker claim; cleared on success/failure or when stale.

alter table queue_call_jobs
  add column if not exists call_notify_processing_at timestamptz;

comment on column queue_call_jobs.called_notified_at is
  'Set when queue_call_now WhatsApp delivery succeeded. Never used as a processing lock.';

comment on column queue_call_jobs.call_notify_processing_at is
  'In-flight queue_call_now send lock. Cleared after success/failure; stale locks are released for retry.';

create index if not exists queue_call_jobs_pending_call_notify_idx
  on queue_call_jobs (called_at)
  where status = 'called'
    and called_notified_at is null;
