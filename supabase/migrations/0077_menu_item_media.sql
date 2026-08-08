-- Dish thumbnails + draft vs live. Drafts stay on the merchant menu editor
-- until they're published; guests only ever see live rows.

alter table public.menu_items
  add column if not exists image_url text;

alter table public.menu_items
  add column if not exists status text not null default 'live';

alter table public.menu_items
  drop constraint if exists menu_items_status_check;

alter table public.menu_items
  add constraint menu_items_status_check
  check (status in ('draft', 'live'));

create index if not exists menu_items_merchant_status_idx
  on public.menu_items (merchant_id, status, sort_order, name);
