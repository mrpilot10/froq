-- Persist the live Razorpay subscription for each product entitlement so upgrades
-- can cancel the previous sub before activating a new one.
alter table merchant_products
  add column if not exists razorpay_subscription_id text;

create index if not exists merchant_products_razorpay_subscription_id_idx
  on merchant_products (razorpay_subscription_id)
  where razorpay_subscription_id is not null;
