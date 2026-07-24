-- Track whether an invited team member has accepted (logged in) yet.
alter table merchant_members
  add column if not exists accepted_at timestamptz;

-- Existing members (owners + already-active) count as accepted.
update merchant_members set accepted_at = created_at where accepted_at is null;
