-- Reservation ↔ AI Menu: confirmation WhatsApp uses reservation_confirmed_menu
-- and the guest reservation page shows View our AI menu once confirmed.

alter table public.merchants
  add column if not exists reservation_ai_menu_enabled boolean not null default true;

comment on column public.merchants.reservation_ai_menu_enabled is
  'When true, reservation confirmation WhatsApp uses reservation_confirmed_menu (AI Menu CTA) and the confirmed guest page shows View our AI menu. Default on for new merchants.';
