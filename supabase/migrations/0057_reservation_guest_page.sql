-- Guest-facing reservation page: every booking gets a permanent public token so
-- WhatsApp only has to carry a "View reservation" link, and the merchant's
-- proposed time is held separately until the guest accepts or declines it.

alter table public.reservations
  add column if not exists public_token text,
  -- Merchant's proposed slot. The booking keeps its original date/time (and
  -- pending status) until the guest answers on the reservation page.
  add column if not exists suggested_date date,
  add column if not exists suggested_time time without time zone,
  add column if not exists suggestion_accepted_at timestamptz,
  -- 'merchant' | 'customer' — drives the wording in the timeline.
  add column if not exists cancelled_by text;

update public.reservations
   set public_token = 'rsv_' || replace(gen_random_uuid()::text, '-', '')
 where public_token is null;

alter table public.reservations
  alter column public_token
    set default ('rsv_' || replace(gen_random_uuid()::text, '-', ''));

alter table public.reservations
  alter column public_token set not null;

create unique index if not exists reservations_public_token_idx
  on public.reservations (public_token);
