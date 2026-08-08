-- New merchants get Queue ↔ AI Menu on by default. Existing rows keep their
-- current value (including explicit offs).

alter table public.merchants
  alter column queue_ai_menu_enabled set default true;

comment on column public.merchants.queue_ai_menu_enabled is
  'When true, queue WhatsApp uses menu CTAs (queue_first_notify_menu / seated_menu) and the waitlist ticket shows View our AI menu. Default on for new merchants.';
