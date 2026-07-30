-- Allow a team member to access specific merchant products.
-- Empty array = access to all products (same semantics as branch_ids).
alter table merchant_members
  add column if not exists product_ids merchant_product[] not null default '{}';
