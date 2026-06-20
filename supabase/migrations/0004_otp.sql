-- Froq SaaS — APITxT OTP support.
-- APITxT only delivers the OTP; verification happens in our app. We persist a
-- hashed OTP per phone with a short expiry so /verify-otp can validate it and
-- so rate limiting works across serverless instances.

create table if not exists public.otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,                 -- E.164 digits, no '+' (e.g. 919876543210)
  otp_hash    text not null,                 -- HMAC-SHA256 of the OTP (never store plaintext)
  request_id  text,                          -- APITxT request_id, for logging/tracking
  channel     text not null default 'sms',
  attempts    int  not null default 0,       -- failed verification attempts
  consumed_at timestamptz,                   -- set once verified; row is then deleted
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists otp_codes_phone_idx on public.otp_codes (phone, created_at desc);
create index if not exists otp_codes_expires_idx on public.otp_codes (expires_at);

-- Only the service-role client touches this table (it bypasses RLS). Enabling RLS
-- with no policies denies all anon/authenticated access.
alter table public.otp_codes enable row level security;

-- Reliable phone → auth user lookup (the JS admin API can't filter users by phone).
-- Service-role only.
create or replace function public.auth_user_id_by_phone(p_phone text)
returns uuid language sql security definer set search_path = auth, public as $$
  select id from auth.users where phone = p_phone limit 1;
$$;

revoke all on function public.auth_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_phone(text) to service_role;
