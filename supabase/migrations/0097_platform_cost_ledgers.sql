-- SMS + email send ledgers for Platform Costs.

create table if not exists public.sms_send_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchants (id) on delete set null,
  template_id text,
  /** Successful sends bill cost_inr; failures stay 0. */
  cost_inr numeric(12, 5) not null default 0,
  /** sent | failed */
  status text not null,
  phone_last4 text,
  provider_status text,
  provider_message text,
  request_id text,
  /** Length of GSM-safe body (chars). */
  body_chars int,
  created_at timestamptz not null default now()
);

comment on table public.sms_send_log is
  'One ApiTxt transactional SMS attempt for DLT spend metering.';

create index if not exists sms_send_log_created_idx
  on public.sms_send_log (created_at desc);

alter table public.sms_send_log enable row level security;

create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  /** Feature / template key e.g. team_invite | password_reset | billing_notice */
  kind text not null,
  cost_usd numeric(12, 6) not null default 0,
  cost_inr numeric(12, 5) not null default 0,
  /** sent | failed */
  status text not null,
  resend_id text,
  to_domain text,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table public.email_send_log is
  'One Resend email send for unit-cost series in Platform Costs.';

create index if not exists email_send_log_created_idx
  on public.email_send_log (created_at desc);

create index if not exists email_send_log_kind_idx
  on public.email_send_log (kind, created_at desc);

alter table public.email_send_log enable row level security;

-- Durable Razorpay payment fee/tax rows (synced from API / future webhooks).
create table if not exists public.razorpay_payment_ledger (
  payment_id text primary key,
  amount_inr numeric(14, 2) not null default 0,
  fee_inr numeric(14, 2) not null default 0,
  tax_inr numeric(14, 2) not null default 0,
  net_inr numeric(14, 2) not null default 0,
  status text not null,
  method text,
  currency text not null default 'INR',
  paid_at timestamptz not null,
  synced_at timestamptz not null default now(),
  raw jsonb
);

comment on table public.razorpay_payment_ledger is
  'Durable Razorpay payment fee snapshot for Platform Costs MTD fee totals.';

create index if not exists razorpay_payment_ledger_paid_at_idx
  on public.razorpay_payment_ledger (paid_at desc);

create index if not exists razorpay_payment_ledger_status_idx
  on public.razorpay_payment_ledger (status, paid_at desc);

alter table public.razorpay_payment_ledger enable row level security;
