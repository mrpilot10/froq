-- Platform-wide WhatsApp send log for cost reporting by Meta category.
-- One row per API TXT sendWA / sendOTP (WhatsApp) attempt.
-- Cost uses India list rates per message (Froq approximates Meta "conversation"
-- price as one charge per successful send).

create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchants (id) on delete set null,
  template_name text not null,
  /** AUTHENTICATION | UTILITY | MARKETING | UNKNOWN */
  category text not null,
  /** Successful sends bill this; failures stay 0. */
  cost_inr numeric(12, 5) not null default 0,
  /** sent | failed */
  status text not null,
  phone_last4 text,
  provider_status text,
  provider_message text,
  request_id text,
  /** sendWA | sendOTP */
  source text not null default 'sendWA',
  created_at timestamptz not null default now()
);

comment on table public.whatsapp_message_log is
  'One WhatsApp send attempt (API TXT) for platform cost rollups by category.';

create index if not exists whatsapp_message_log_created_idx
  on public.whatsapp_message_log (created_at desc);

create index if not exists whatsapp_message_log_category_idx
  on public.whatsapp_message_log (category, created_at desc);

create index if not exists whatsapp_message_log_merchant_idx
  on public.whatsapp_message_log (merchant_id, created_at desc)
  where merchant_id is not null;

alter table public.whatsapp_message_log enable row level security;
-- Service-role only (admin dashboard + send path). No client policies.
