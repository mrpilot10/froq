-- Guest AI Menu features merchants can turn off from Menu settings.
-- Defaults stay on so existing venues keep table ordering and staff pings.

alter table public.merchants
  add column if not exists menu_table_ordering boolean not null default true;

alter table public.merchants
  add column if not exists menu_server_notify boolean not null default true;

comment on column public.merchants.menu_table_ordering is
  'When false, guests browse only — no cart / table order from the AI Menu.';

comment on column public.merchants.menu_server_notify is
  'When false, hide Need something? and do not create staff floor requests.';
