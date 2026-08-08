-- Monthly AI Reply usage on Menu product rows + analytics log for successful replies.

alter table public.merchant_products
  add column if not exists ai_replies_used integer not null default 0,
  add column if not exists ai_replies_cycle_end timestamptz;

comment on column public.merchant_products.ai_replies_used is
  'Successful guest AI replies in the current Menu billing cycle. Reset when ai_replies_cycle_end rolls.';
comment on column public.merchant_products.ai_replies_cycle_end is
  'Matches merchant_products.current_period_end for the cycle this counter applies to.';

create table if not exists public.menu_ai_reply_log (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  guest_id text not null,
  conversation_id text not null,
  created_at timestamptz not null default now(),
  prompt_tokens integer,
  response_tokens integer,
  thoughts_tokens integer,
  total_tokens integer,
  model text,
  response_ms integer
);

comment on table public.menu_ai_reply_log is
  'One row per successful guest AI Menu reply — used for fair-use caps and cost analytics.';

create index if not exists menu_ai_reply_log_merchant_created_idx
  on public.menu_ai_reply_log (merchant_id, created_at desc);

create index if not exists menu_ai_reply_log_conversation_idx
  on public.menu_ai_reply_log (merchant_id, conversation_id, created_at desc);

create index if not exists menu_ai_reply_log_guest_day_idx
  on public.menu_ai_reply_log (merchant_id, guest_id, created_at desc);

alter table public.menu_ai_reply_log enable row level security;
