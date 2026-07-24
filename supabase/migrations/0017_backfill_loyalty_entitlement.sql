-- Backfill: every existing merchant already had loyalty enabled and set up,
-- so grant them an active, already-onboarded loyalty entitlement. Queue stays
-- unpurchased (they can activate it via the in-app "Get Started" flow).
insert into merchant_products (merchant_id, product, status, purchased_at, onboarded_at)
select m.id, 'loyalty'::merchant_product, 'active'::product_status, m.created_at, m.created_at
from merchants m
where not exists (
  select 1 from merchant_products mp
  where mp.merchant_id = m.id and mp.product = 'loyalty'
);
