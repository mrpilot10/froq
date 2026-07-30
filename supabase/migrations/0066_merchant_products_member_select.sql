-- Staff/managers must be able to read merchant_products so the dashboard can
-- resolve entitlements. Without SELECT, invited teammates see every product as
-- "not enabled" even when the owner has an active plan.
-- Writes stay owner-only via merchant_products_owner_all.

drop policy if exists merchant_products_member_select on merchant_products;
create policy merchant_products_member_select on merchant_products
  for select
  using (merchant_id = any (select auth_user_merchant_ids()));
