-- Auto-assign tables by default (opt-out in Reservation settings).

alter table public.merchants
  alter column reservation_auto_assign_tables set default true;

update public.merchants
set reservation_auto_assign_tables = true
where reservation_auto_assign_tables = false;

comment on column public.merchants.reservation_auto_assign_tables is
  'When true (default), confirming a reservation assigns the best free table for the party size.';
