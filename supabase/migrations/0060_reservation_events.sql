-- Who did what to a booking.
--
-- A reservation collects several attributable actions over its life — one
-- teammate confirms it, another proposes a new time, a third marks the no-show —
-- so attribution can't live in columns on the booking the way it does for a
-- stamp (visits.performed_by_*, 0052) or a queue session
-- (queue_sessions.started_by_*, 0051). One row per action keeps the whole trail.
--
-- Name and role are snapshotted at write time, same rule as 0051/0052: renames,
-- role changes and removed teammates never rewrite history.
--
-- Every reservation write runs on the service-role client inside a server
-- action, so there is no auth.uid() for a trigger to read (unlike the loyalty
-- RPCs). The actor comes from requireMerchantContext() instead — resolved from
-- the session cookie server-side, so it still can't be set by the client.

create table if not exists public.reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete cascade,
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  event text not null,
  /** staff | guest | system — a booking's trail mixes all three. */
  actor_kind text not null default 'staff',
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  /** Short context for the trail: decline reason, the slot proposed, etc. */
  detail text,
  created_at timestamptz not null default now()
);

comment on table public.reservation_events is
  'Audit trail of reservation actions, one row per action.';
comment on column public.reservation_events.event is
  'created | confirmed | declined | cancelled | completed | no_show | suggested | suggestion_accepted.';
comment on column public.reservation_events.actor_kind is
  'staff (a signed-in teammate), guest (the customer on their page), or system (cron).';
comment on column public.reservation_events.actor_user_id is
  'auth.users id of the teammate who acted; null for guest and system actions.';
comment on column public.reservation_events.actor_name is
  'Display name captured when the action happened; never backfilled.';
comment on column public.reservation_events.actor_role is
  'owner | manager | staff at the time of the action.';

-- The drawer reads one booking's trail in order.
create index if not exists reservation_events_reservation_idx
  on public.reservation_events (reservation_id, created_at);

-- Per-teammate reporting ("who handled what") reads by actor.
create index if not exists reservation_events_actor_idx
  on public.reservation_events (merchant_id, actor_user_id, created_at desc);

-- RLS mirrors reservations: merchants read their own trail, and writes only ever
-- happen on the service-role client inside a server action.
alter table public.reservation_events enable row level security;

drop policy if exists reservation_events_select on public.reservation_events;
create policy reservation_events_select on public.reservation_events
  for select using (auth_owns_merchant(merchant_id));
