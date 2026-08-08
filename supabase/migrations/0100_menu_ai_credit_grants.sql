-- Lifetime AI Generation credit grants for AI Menu.
-- Used = menu_events (ai_gen_description | ai_gen_image).
-- Remaining = sum(grants.credits) - used.
-- Upgrades ADD the new plan's full allotment on top of leftovers.

create table if not exists public.menu_ai_credit_grants (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  credits integer not null check (credits > 0),
  plan_id text,
  reason text not null,
  created_at timestamptz not null default now()
);

comment on table public.menu_ai_credit_grants is
  'AI Menu Generation credit grants. Activate/upgrade adds the plan allotment; leftovers remain.';

comment on column public.menu_ai_credit_grants.reason is
  'activate | upgrade | seed — never reduced on downgrade.';

create index if not exists menu_ai_credit_grants_merchant_idx
  on public.menu_ai_credit_grants (merchant_id, created_at desc);

alter table public.menu_ai_credit_grants enable row level security;
