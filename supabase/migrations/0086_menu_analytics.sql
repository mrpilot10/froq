-- What guests do on the AI menu, and what the AI costs to run it.
--
-- The menu had no telemetry at all: the catalogue tables say what is on offer,
-- and menu_orders says what was ordered, but nothing recorded a scan, a
-- question, a cart add or a language switch. Merchant analytics needs the
-- browsing half of that story, so this adds it.
--
-- Two tables rather than one. menu_events is guest behaviour and is written on
-- every scan; ai_usage is billing telemetry written once per Gemini call. They
-- grow at very different rates and get read by different panels, so keeping
-- them apart avoids a wide sparse table and lets each one carry its own index.

-- One row per guest action on the menu.
--
-- Anonymous by construction. There is no guest session to trust (the menu is a
-- public slug, no login), so nothing here identifies a person: session_key is a
-- random id the page mints per visit and forgets on close, used only to count
-- visits rather than page loads. No IP, no device id, no customer_id.
create table if not exists public.menu_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete set null,
  event text not null,
  /** The dish a dish_viewed / cart_add / rec_added row is about. */
  item_id uuid references public.menu_items (id) on delete set null,
  /** Snapshotted so a renamed or deleted dish never rewrites past reports. */
  item_name text,
  /** Menu language at the time of the action — 'EN', 'HI', … */
  lang text,
  /** Free text for the row: the question asked, the offer title, the dish added. */
  detail text,
  /** Random per-visit id from the page. Not a person, not stable across visits. */
  session_key text,
  created_at timestamptz not null default now()
);

comment on table public.menu_events is
  'Anonymous guest activity on the AI menu, one row per action.';
comment on column public.menu_events.event is
  'menu_opened | dish_viewed | chat_asked | chat_answered | cart_add | cart_remove | rec_added | offer_viewed | insights_viewed | lang_changed.';
comment on column public.menu_events.session_key is
  'Random per-visit id minted by the page so visits can be counted; never a person.';
comment on column public.menu_events.item_name is
  'Dish name captured when the action happened; never backfilled.';
comment on column public.menu_events.detail is
  'Row-specific context: chat question text, offer title, language moved to.';

-- Every analytics panel scans one merchant over a date range.
create index if not exists menu_events_merchant_idx
  on public.menu_events (merchant_id, created_at desc);

-- Per-event counts (questions asked, scans, cart adds) filter by event first.
create index if not exists menu_events_event_idx
  on public.menu_events (merchant_id, event, created_at desc);

-- "Most viewed / most added dishes" groups by dish.
create index if not exists menu_events_item_idx
  on public.menu_events (merchant_id, item_id, created_at desc)
  where item_id is not null;

-- RLS mirrors the rest of the menu tables: a merchant reads its own activity,
-- and writes only ever happen on the service-role client inside a route handler
-- (the guest is anonymous, so there is no auth.uid() to check on insert).
alter table public.menu_events enable row level security;

drop policy if exists menu_events_select on public.menu_events;
create policy menu_events_select on public.menu_events
  for select using (auth_owns_merchant(merchant_id));

-- One row per Gemini call, so AI spend is reportable per merchant.
--
-- This mirrors the ai_usage JSON line that logAiUsage() already writes to
-- stdout. The log line stays — it is the only record for calls that happen
-- outside a merchant context — but stdout can't be charted, and a log drain
-- can't answer "what did this restaurant cost us last month".
--
-- Prompts and answers are deliberately absent: token counts are enough to price
-- a call, and guest questions are already covered by menu_events.detail.
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  /** Null for calls with no merchant in scope, e.g. an internal script. */
  merchant_id uuid references public.merchants (id) on delete cascade,
  feature text not null,
  kind text not null default 'text',
  model text not null,
  prompt_tokens int,
  response_tokens int,
  /** Gemini 3.x hidden reasoning, billed as output. */
  thoughts_tokens int,
  /** Share of prompt_tokens served from a context cache, billed at a tenth. */
  cached_tokens int,
  total_tokens int,
  created_at timestamptz not null default now()
);

comment on table public.ai_usage is
  'One row per Gemini call for cost reporting. Never stores prompts or answers.';
comment on column public.ai_usage.feature is
  'menu_chat | menu_cart_insights | menu_extract | menu_translate | dish_enrich | dish_image | other.';
comment on column public.ai_usage.kind is
  'text or image — image calls are priced per picture, not per token.';
comment on column public.ai_usage.cached_tokens is
  'Prompt tokens served from a Gemini context cache; the rest bill at full rate.';

create index if not exists ai_usage_merchant_idx
  on public.ai_usage (merchant_id, created_at desc);

-- The cost panel breaks spend down by feature.
create index if not exists ai_usage_feature_idx
  on public.ai_usage (merchant_id, feature, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select using (auth_owns_merchant(merchant_id));
