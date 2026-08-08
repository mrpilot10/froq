-- Parallel customer notification emails: idempotency + pending status.

alter table public.email_send_log
  add column if not exists dedupe_key text;

comment on column public.email_send_log.dedupe_key is
  'Stable key for customer notification emails — unique so retries do not double-send.';

-- Allow pending rows (claimed before Resend responds).
-- Existing status values remain sent | failed | pending.

create unique index if not exists email_send_log_dedupe_key_uidx
  on public.email_send_log (dedupe_key)
  where dedupe_key is not null;
