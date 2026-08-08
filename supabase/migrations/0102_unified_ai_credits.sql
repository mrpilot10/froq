-- Unified AI Credits wallet (Menu product billing cycle) + usage analytics.

create table if not exists public.merchant_ai_usage (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  billing_period text not null,
  monthly_credits_total integer not null default 0,
  monthly_credits_used integer not null default 0,
  purchased_credits_remaining integer not null default 0,
  cycle_ends_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (merchant_id, billing_period)
);

create index if not exists merchant_ai_usage_merchant_idx
  on public.merchant_ai_usage (merchant_id);

comment on table public.merchant_ai_usage is
  'Per-billing-period AI credit wallet for a merchant (tied to Menu plan cycle).';

create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  customer_id text,
  feature text not null,
  credits_used integer not null,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  thoughts_tokens integer,
  estimated_cost_usd numeric(12, 6),
  response_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_log_merchant_created_idx
  on public.ai_usage_log (merchant_id, created_at desc);

create index if not exists ai_usage_log_merchant_feature_idx
  on public.ai_usage_log (merchant_id, feature, created_at desc);

comment on table public.ai_usage_log is
  'One row per successful AI action that consumed credits — for meters and cost analytics.';

alter table public.merchant_ai_usage enable row level security;
alter table public.ai_usage_log enable row level security;
