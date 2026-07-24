-- Allow a team member to control multiple branches.
-- Empty array = access to all branches.
alter table merchant_members
  add column if not exists branch_ids uuid[] not null default '{}';

-- Backfill from the legacy single branch_id.
update merchant_members
  set branch_ids = array[branch_id]
  where branch_id is not null
    and (branch_ids is null or array_length(branch_ids, 1) is null);
