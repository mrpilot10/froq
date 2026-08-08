-- Loyalty was historically seeded active with plan_id null while enforcement
-- already used Starter caps. Persist Starter so UI meters / plan cards match.
update merchant_products
set plan_id = 'starter'
where product = 'loyalty'
  and plan_id is null
  and status = 'active';
