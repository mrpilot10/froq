-- Reservation-held queue slots: confirmed bookings occupy a future queue
-- position (joined_at = reservation datetime) until arrival or grace expiry.
--
-- NOTE: enum ADD VALUE cannot be used in the same transaction as indexes/predicates
-- that reference the new label (SQLSTATE 55P04). Indexes live in 0071.

alter type public.queue_entry_status add value if not exists 'held';

alter table public.queue_entries
  add column if not exists reservation_id uuid references public.reservations (id) on delete set null;

comment on column public.queue_entries.reservation_id is
  'Linked booking when kind=reservation. One active hold per reservation.';

-- Minutes after reservation_at before an unarrived guest is marked no-show
-- and their held queue slot is released. 0 = release immediately when due.
alter table public.merchants
  add column if not exists reservation_grace_minutes smallint not null default 15
  check (reservation_grace_minutes >= 0 and reservation_grace_minutes <= 120);

comment on column public.merchants.reservation_grace_minutes is
  'After reservation time, how long to hold the queue slot before no-show release.';
