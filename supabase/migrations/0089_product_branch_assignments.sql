-- Global branches stay on `branches`. Products activate a subset via this table.
-- Creation is never capped here — only active assignment counts against a plan.

create table if not exists product_branch_assignments (
  merchant_id uuid not null references merchants (id) on delete cascade,
  product     merchant_product not null,
  branch_id   uuid not null references branches (id) on delete cascade,
  status      text not null default 'active'
                check (status in ('active', 'inactive')),
  assigned_at timestamptz not null default now(),
  primary key (merchant_id, product, branch_id)
);

create index if not exists product_branch_assignments_product_idx
  on product_branch_assignments (merchant_id, product)
  where status = 'active';

create index if not exists product_branch_assignments_branch_idx
  on product_branch_assignments (branch_id);

alter table product_branch_assignments enable row level security;

-- Team can read; owners/managers write through auth_owns_merchant (same as branches).
drop policy if exists product_branch_assignments_read on product_branch_assignments;
create policy product_branch_assignments_read on product_branch_assignments
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists product_branch_assignments_write on product_branch_assignments;
create policy product_branch_assignments_write on product_branch_assignments
  for all
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));

-- Preserve today's behaviour: every existing physical branch is active on every
-- product the merchant already owns.
insert into product_branch_assignments (merchant_id, product, branch_id, status)
select mp.merchant_id, mp.product, b.id, 'active'
from merchant_products mp
join branches b on b.merchant_id = mp.merchant_id
on conflict (merchant_id, product, branch_id) do nothing;
