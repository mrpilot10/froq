-- Explicit floor availability for AI Menu staff. Being logged in is not enough —
-- teammates toggle Available on the home screen to receive requests and orders.

alter table public.merchant_members
  add column if not exists menu_on_floor boolean not null default false;

comment on column public.merchant_members.menu_on_floor is
  'When true, this teammate is on the AI Menu floor and can be auto-assigned work.';

create index if not exists merchant_members_menu_on_floor_idx
  on public.merchant_members (merchant_id, menu_on_floor)
  where menu_on_floor = true;
