-- Expand Razorpay payment ledger for Revenue (gross, refunds, country, failures).
-- Idempotent webhook event log + subscription failure events.

alter table public.razorpay_payment_ledger
  add column if not exists amount_refunded_inr numeric(14, 2) not null default 0,
  add column if not exists order_id text,
  add column if not exists subscription_id text,
  add column if not exists email text,
  add column if not exists contact text,
  add column if not exists international boolean not null default false,
  add column if not exists country text,
  add column if not exists error_code text,
  add column if not exists error_description text,
  add column if not exists source text not null default 'api_sync';

comment on column public.razorpay_payment_ledger.country is
  'IN for domestic, otherwise card/issuer country or INTL.';
comment on column public.razorpay_payment_ledger.source is
  'api_sync | webhook';

create index if not exists razorpay_payment_ledger_subscription_idx
  on public.razorpay_payment_ledger (subscription_id)
  where subscription_id is not null;

create index if not exists razorpay_payment_ledger_country_idx
  on public.razorpay_payment_ledger (country, paid_at desc);

create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

comment on table public.razorpay_webhook_events is
  'Idempotency log for Razorpay webhook deliveries.';

alter table public.razorpay_webhook_events enable row level security;

create table if not exists public.razorpay_subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null,
  event_type text not null,
  payment_id text,
  status text,
  amount_inr numeric(14, 2),
  error_code text,
  error_description text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (subscription_id, event_type, payment_id, occurred_at)
);

comment on table public.razorpay_subscription_events is
  'Subscription lifecycle / failed renewal events from Razorpay sync + webhooks.';

create index if not exists razorpay_subscription_events_occurred_idx
  on public.razorpay_subscription_events (occurred_at desc);

create index if not exists razorpay_subscription_events_type_idx
  on public.razorpay_subscription_events (event_type, occurred_at desc);

alter table public.razorpay_subscription_events enable row level security;
