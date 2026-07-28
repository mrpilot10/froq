-- Reservation messages are sent in the background (after() on merchant actions,
-- a cron worker for reminders), so a failure has nowhere to surface: the guest
-- silently never hears back and the merchant never finds out.
--
-- Record the last failed send on the booking. Only failures are kept — a send
-- that succeeds clears these, so a populated reason always means "this guest
-- still hasn't been told". Realtime already streams the row to the dashboard.

alter table public.reservations
  add column if not exists notify_failed_template text,
  add column if not exists notify_failed_reason   text,
  add column if not exists notify_failed_at       timestamptz;
