-- Tax and service charge the AI Menu quotes on a table order.
--
-- The guest cart hard-coded CGST 2.5%, SGST 2.5% and a 5% service charge.
-- That is right for a Maharashtra restaurant and wrong everywhere else: the
-- GST split differs by state and registration, and service charge is optional
-- (and must be waivable), so all three belong to the merchant.
--
-- Defaults reproduce the old hard-coded numbers so no guest sees a different
-- bill until their restaurant edits them. numeric(5,2) rather than an integer
-- because half-point GST rates are the norm here, not an edge case.

alter table public.merchants
  add column if not exists menu_cgst_percent numeric(5, 2) not null default 2.5
  check (menu_cgst_percent >= 0 and menu_cgst_percent <= 100);

alter table public.merchants
  add column if not exists menu_sgst_percent numeric(5, 2) not null default 2.5
  check (menu_sgst_percent >= 0 and menu_sgst_percent <= 100);

alter table public.merchants
  add column if not exists menu_service_charge_percent numeric(5, 2) not null default 5
  check (menu_service_charge_percent >= 0 and menu_service_charge_percent <= 100);

comment on column public.merchants.menu_cgst_percent is
  'Central GST percent quoted on AI Menu cart totals. 0 hides the row entirely.';

comment on column public.merchants.menu_sgst_percent is
  'State GST percent quoted on AI Menu cart totals. 0 hides the row entirely.';

comment on column public.merchants.menu_service_charge_percent is
  'Service charge percent quoted on AI Menu cart totals. 0 hides the row entirely.';
