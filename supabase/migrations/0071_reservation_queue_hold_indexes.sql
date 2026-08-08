-- Indexes that reference queue_entry_status 'held' (added in 0070).
-- Must be a separate migration so the new enum value is committed first.

-- At most one open (held/waiting/called) queue entry per reservation.
create unique index if not exists queue_entries_reservation_open_uidx
  on public.queue_entries (reservation_id)
  where reservation_id is not null
    and status in ('held', 'waiting', 'called');

create index if not exists queue_entries_session_line_idx
  on public.queue_entries (session_id, status, joined_at)
  where status in ('held', 'waiting', 'called');
