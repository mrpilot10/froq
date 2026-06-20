-- Add a per-customer rewards-claimed count (redemptions) to the customers
-- overview so the merchant's customer details can show lifetime rewards.
create or replace view customer_overview with (security_invoker = on) as
  select
    c.id,
    c.merchant_id,
    c.user_id,
    c.name,
    c.phone,
    c.email,
    c.banned,
    c.member_since,
    c.created_at,
    coalesce(lc.stamps, 0) as stamps,
    coalesce(lc.status, 'active')::card_status as status,
    m.total_stamps,
    (select count(*) from visits v where v.customer_id = c.id) as lifetime_visits,
    (select count(*) from redemptions r where r.customer_id = c.id) as rewards_claimed,
    (select max(v.created_at) from visits v where v.customer_id = c.id) as last_visit
  from customers c
  join merchants m on m.id = c.merchant_id
  left join loyalty_cards lc on lc.customer_id = c.id;
