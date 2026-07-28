-- Attribute each queue session to the teammate who started it.
-- Name and role are snapshotted at start time so renames, role changes, or
-- removed teammates never rewrite historical sessions.

alter table queue_sessions
  add column if not exists started_by_user_id uuid,
  add column if not exists started_by_name text,
  add column if not exists started_by_role text;

comment on column queue_sessions.started_by_user_id is
  'auth.users id of the teammate who started this session (null for legacy rows).';

comment on column queue_sessions.started_by_name is
  'Display name captured when the session started; never backfilled.';

comment on column queue_sessions.started_by_role is
  'owner | manager | staff at the time the session started.';

create index if not exists queue_sessions_started_by_idx
  on queue_sessions (merchant_id, started_by_user_id, started_at desc);
