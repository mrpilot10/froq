-- Show / hide the Loyalty stamps card on the guest digital menu.
-- Default on so existing venues keep the join tile until they turn it off.

alter table public.merchants
  add column if not exists menu_show_loyalty_stamps boolean not null default true;

comment on column public.merchants.menu_show_loyalty_stamps is
  'When false, hide the Loyalty stamp card and join CTA on the AI Menu.';
