-- Attribute each stamp and redemption to the teammate who performed it.
--
-- Name and role are snapshotted at write time so renames, role changes, or
-- removed teammates never rewrite loyalty history — same rule as
-- queue_sessions.started_by_* (0051).
--
-- Rows are inserted inside the approve_stamp / offer_stamp / redeem_reward
-- RPCs rather than from the app, so the actor is captured by a trigger from
-- auth.uid() instead of being passed in. That keeps every current and future
-- write path attributed and makes the value impossible to spoof from the
-- client. Service-role writes (cron, backfills) have no auth.uid() and stay
-- null, which the UI renders as unattributed.

alter table visits
  add column if not exists performed_by_user_id uuid,
  add column if not exists performed_by_name text,
  add column if not exists performed_by_role text;

alter table redemptions
  add column if not exists performed_by_user_id uuid,
  add column if not exists performed_by_name text,
  add column if not exists performed_by_role text;

comment on column visits.performed_by_user_id is
  'auth.users id of the teammate who granted this stamp (null for legacy rows).';
comment on column visits.performed_by_name is
  'Display name captured at stamp time; never backfilled.';
comment on column visits.performed_by_role is
  'owner | manager | staff at the time the stamp was granted.';

comment on column redemptions.performed_by_user_id is
  'auth.users id of the teammate who redeemed this reward (null for legacy rows).';
comment on column redemptions.performed_by_name is
  'Display name captured at redemption time; never backfilled.';
comment on column redemptions.performed_by_role is
  'owner | manager | staff at the time the reward was redeemed.';

-- Resolves the acting teammate for a merchant, mirroring the app's pickName
-- fallback chain: explicit name → first + last → email.
create or replace function loyalty_capture_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_name text;
  v_email text;
  v_role text;
begin
  -- Respect an explicitly supplied actor, and skip service-role writes.
  if new.performed_by_user_id is not null or v_uid is null then
    return new;
  end if;

  select owner_user_id,
         nullif(trim(coalesce(owner_first_name, '') || ' ' || coalesce(owner_last_name, '')), ''),
         email
    into v_owner, v_name, v_email
    from merchants
   where id = new.merchant_id;

  if v_owner = v_uid then
    new.performed_by_user_id := v_uid;
    new.performed_by_name := coalesce(v_name, v_email);
    new.performed_by_role := 'owner';
    return new;
  end if;

  select coalesce(
           nullif(trim(coalesce(mm.name, '')), ''),
           nullif(trim(coalesce(mm.first_name, '') || ' ' || coalesce(mm.last_name, '')), ''),
           mm.email
         ),
         case
           when mm.role in ('owner', 'manager', 'staff') then mm.role
           else 'staff'
         end
    into v_name, v_role
    from merchant_members mm
   where mm.merchant_id = new.merchant_id
     and mm.user_id = v_uid;

  if v_role is null then
    return new;
  end if;

  new.performed_by_user_id := v_uid;
  new.performed_by_name := v_name;
  new.performed_by_role := v_role;
  return new;
end;
$$;

drop trigger if exists visits_capture_actor on visits;
create trigger visits_capture_actor
  before insert on visits
  for each row execute function loyalty_capture_actor();

drop trigger if exists redemptions_capture_actor on redemptions;
create trigger redemptions_capture_actor
  before insert on redemptions
  for each row execute function loyalty_capture_actor();

create index if not exists visits_performed_by_idx
  on visits (merchant_id, performed_by_user_id, created_at desc);

create index if not exists redemptions_performed_by_idx
  on redemptions (merchant_id, performed_by_user_id, redeemed_at desc);
