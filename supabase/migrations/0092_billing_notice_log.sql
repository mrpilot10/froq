-- Dedupes owner billing / usage emails so cron + event hooks don't re-send
-- the same notice in a given window (billing month, trial, or plan id).

create table if not exists billing_notice_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  product text not null,
  notice_type text not null,
  period_key text not null,
  sent_at timestamptz not null default now(),
  unique (merchant_id, product, notice_type, period_key)
);

create index if not exists billing_notice_log_merchant_idx
  on billing_notice_log (merchant_id, sent_at desc);

alter table billing_notice_log enable row level security;
-- Cron / server actions use the service role; no client policies.
