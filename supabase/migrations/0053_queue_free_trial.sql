-- 7-day free trial for Queue Management.
--
-- A trial is an ordinary entitlement row with status 'active', plan_id null and
-- trial_ends_at in the future — no new product_status value, so every existing
-- access check keeps working. Expiry is derived on read (see
-- lib/merchant/entitlements.ts) rather than flipped by a cron, so a missed job
-- can never hand out free access.
--
-- trial_started_at is kept after the trial lapses: it's what enforces
-- one trial per merchant per product.

alter table merchant_products
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at    timestamptz;

create index if not exists merchant_products_trial_idx
  on merchant_products (merchant_id, product)
  where trial_ends_at is not null;
