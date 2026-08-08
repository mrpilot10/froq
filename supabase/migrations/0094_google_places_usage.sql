-- Platform-wide Google Places request log for usage and estimated cost.
-- Covers Text Search (onboarding autocomplete-like search) and Place Details.

create table if not exists public.google_places_usage (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchants (id) on delete set null,
  /** text_search | place_details | autocomplete */
  kind text not null,
  /** worker | direct */
  path text not null default 'worker',
  status text not null,
  /** Estimated USD list-price for this call (0 on failure). */
  cost_usd numeric(12, 6) not null default 0,
  query_chars int,
  result_count int,
  http_status int,
  error_code text,
  created_at timestamptz not null default now()
);

comment on table public.google_places_usage is
  'One Google Places API call (via worker or direct) for usage/cost metering.';

create index if not exists google_places_usage_created_idx
  on public.google_places_usage (created_at desc);

create index if not exists google_places_usage_kind_idx
  on public.google_places_usage (kind, created_at desc);

alter table public.google_places_usage enable row level security;
-- Service-role only.
