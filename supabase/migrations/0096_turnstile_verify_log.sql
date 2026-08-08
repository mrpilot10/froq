-- Server-side Turnstile siteverify outcomes for pass/fail rates in admin.

create table if not exists public.turnstile_verify_log (
  id uuid primary key default gen_random_uuid(),
  /** pass | fail | error | skipped */
  status text not null,
  /** Cloudflare error-codes when present (e.g. timeout-or-duplicate). */
  error_codes text[] not null default '{}',
  /** Optional caller hint: merchant_login | join | otp | reservation | … */
  source text,
  created_at timestamptz not null default now()
);

comment on table public.turnstile_verify_log is
  'One Cloudflare Turnstile siteverify attempt (server-side) for pass/fail metering.';

create index if not exists turnstile_verify_log_created_idx
  on public.turnstile_verify_log (created_at desc);

create index if not exists turnstile_verify_log_status_idx
  on public.turnstile_verify_log (status, created_at desc);

alter table public.turnstile_verify_log enable row level security;
-- Service-role only.
