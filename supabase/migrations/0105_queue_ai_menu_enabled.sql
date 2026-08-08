-- Queue ↔ AI Menu integration: waitlist CTA, menu WhatsApp templates, skip
-- guest re-verify when opening the digital menu from the queue.

alter table public.merchants
  add column if not exists queue_ai_menu_enabled boolean not null default false;

comment on column public.merchants.queue_ai_menu_enabled is
  'When true, queue WhatsApp uses menu CTAs (queue_first_notify_menu / seated_menu) and the waitlist ticket shows View our AI menu.';
