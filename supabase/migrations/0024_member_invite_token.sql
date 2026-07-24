-- Tokenized team invites (7-day expiry) + profile fields collected on accept.
alter table merchant_members
  add column if not exists invite_token text unique,
  add column if not exists invite_expires_at timestamptz,
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text;

create index if not exists merchant_members_invite_token_idx
  on merchant_members (invite_token)
  where invite_token is not null;
