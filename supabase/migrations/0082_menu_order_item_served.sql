-- Per-dish serving. Staff tick off lines one at a time as food reaches the
-- table, so a round can be half-served without lying about the whole round.

alter table public.menu_order_items
  add column if not exists served_at timestamptz;

comment on column public.menu_order_items.served_at is
  'When this dish reached the table. Null while it is still coming.';

create index if not exists menu_order_items_pending_idx
  on public.menu_order_items (order_id)
  where served_at is null;
