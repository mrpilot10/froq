-- Web Push subscriptions for merchant approval alerts.
-- A merchant owner registers one row per browser/device. Push messages are
-- sent server-side with the service role (bypassing RLS) from the customer's
-- stamp-request action.

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_subscriptions_merchant_idx on push_subscriptions (merchant_id);

alter table push_subscriptions enable row level security;

-- Only the merchant owner can manage their own subscriptions.
drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select
  using (auth_owns_merchant(merchant_id));

drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions for insert
  with check (auth_owns_merchant(merchant_id));

-- Needed for upsert (on conflict do update) when a device re-subscribes.
drop policy if exists push_subscriptions_update on push_subscriptions;
create policy push_subscriptions_update on push_subscriptions for update
  using (auth_owns_merchant(merchant_id)) with check (auth_owns_merchant(merchant_id));

drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions for delete
  using (auth_owns_merchant(merchant_id));
