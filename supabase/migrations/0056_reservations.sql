-- Reservations: table bookings requested from a public QR / link and reviewed
-- by the merchant. Mirrors the queue module (merchant-scoped RLS, public writes
-- go through server actions on the admin client).

alter type merchant_product add value if not exists 'reservation';

do $$ begin
  create type reservation_status as enum (
    'pending',
    'confirmed',
    'declined',
    'cancelled',
    'completed',
    'no_show'
  );
exception when duplicate_object then null; end $$;

-- Per-merchant reservation settings live on merchants, like queue store hours.
alter table public.merchants
  add column if not exists reservation_description        text,
  add column if not exists reservation_max_party_size     smallint    not null default 12,
  add column if not exists reservation_interval_minutes   smallint    not null default 30,
  add column if not exists reservation_open_time          time without time zone not null default '11:00',
  add column if not exists reservation_close_time         time without time zone not null default '22:00',
  add column if not exists reservation_allow_same_day     boolean     not null default true,
  add column if not exists reservation_allow_notes        boolean     not null default true,
  -- 0 = never auto decline (future automation).
  add column if not exists reservation_auto_decline_hours smallint    not null default 0,
  add column if not exists reservation_whatsapp_enabled   boolean     not null default true;

create table if not exists reservations (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        uuid not null references merchants (id) on delete cascade,
  branch_id          uuid references branches (id) on delete set null,
  reservation_number int  not null,
  customer_id        uuid references customers (id) on delete set null,
  customer_name      text not null,
  customer_phone     text not null,
  customer_whatsapp  text,
  party_size         int  not null check (party_size >= 1),
  reservation_date   date not null,
  reservation_time   time without time zone not null,
  status             reservation_status not null default 'pending',
  /** Guest note captured on the public form. */
  notes              text,
  /** Private note the merchant keeps against the booking. */
  merchant_notes     text,
  /** Reason shown to the guest when a request is declined. */
  decline_reason     text,
  /** Set when the merchant proposes a different slot (status stays pending). */
  suggested_at       timestamptz,
  confirmed_at       timestamptz,
  declined_at        timestamptz,
  cancelled_at       timestamptz,
  completed_at       timestamptz,
  no_show_at         timestamptz,
  -- Reminder bookkeeping so the cron never sends the same nudge twice.
  reminder_24h_sent_at timestamptz,
  reminder_2h_sent_at  timestamptz,
  reminder_30m_sent_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists reservations_number_idx
  on reservations (merchant_id, reservation_number);

create index if not exists reservations_merchant_date_idx
  on reservations (merchant_id, reservation_date, reservation_time);

create index if not exists reservations_status_idx
  on reservations (merchant_id, status);

create index if not exists reservations_phone_idx
  on reservations (merchant_id, customer_phone);

-- Reminder scan: only confirmed bookings with an unsent nudge.
create index if not exists reservations_reminder_idx
  on reservations (reservation_date, reservation_time)
  where status = 'confirmed';

/**
 * Per-merchant booking numbers. The advisory lock is scoped to the merchant so
 * two concurrent requests can't claim the same number.
 */
create or replace function reservations_assign_number()
returns trigger
language plpgsql
as $$
begin
  if new.reservation_number is not null and new.reservation_number > 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('reservations:' || new.merchant_id::text));

  select coalesce(max(reservation_number), 0) + 1
    into new.reservation_number
    from reservations
   where merchant_id = new.merchant_id;

  return new;
end;
$$;

drop trigger if exists reservations_assign_number_trg on reservations;
create trigger reservations_assign_number_trg
  before insert on reservations
  for each row execute function reservations_assign_number();

create or replace function reservations_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reservations_touch_updated_at_trg on reservations;
create trigger reservations_touch_updated_at_trg
  before update on reservations
  for each row execute function reservations_touch_updated_at();

-- RLS: merchants read/write their own bookings. Public requests are inserted by
-- the server action on the service-role client, so there is no anon policy.
alter table reservations enable row level security;

drop policy if exists reservations_select on reservations;
create policy reservations_select on reservations
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists reservations_insert on reservations;
create policy reservations_insert on reservations
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists reservations_update on reservations;
create policy reservations_update on reservations
  for update using (auth_owns_merchant(merchant_id));

-- Realtime: the merchant dashboard subscribes to inserts + status changes.
do $$ begin
  alter publication supabase_realtime add table reservations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
