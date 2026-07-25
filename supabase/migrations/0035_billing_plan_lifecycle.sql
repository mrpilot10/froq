-- Billing lifecycle fields for plan changes.
-- pending_plan_id: scheduled downgrade (applied at current_period_end)
-- cancel_at_period_end: cancel after paid period, then Free plan
-- current_period_end: when the current paid period ends / renews

alter table merchant_products
  add column if not exists pending_plan_id text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists current_period_end timestamptz;

-- Backfill period end from purchased_at for active paid plans.
update merchant_products
set current_period_end = case
  when plan_id like '%-yearly' then purchased_at + interval '1 year'
  when plan_id is not null and plan_id <> 'free' then purchased_at + interval '1 month'
  else current_period_end
end
where current_period_end is null
  and status = 'active'
  and plan_id is not null
  and plan_id <> 'free';
