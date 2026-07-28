-- Merchants can stop taking new online bookings without touching their hours,
-- the same way they pause the live queue. Their own manual bookings still work;
-- only the public request form is closed.

alter table public.merchants
  add column if not exists reservation_paused boolean not null default false;
