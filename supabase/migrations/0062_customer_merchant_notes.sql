-- Private merchant notes on loyalty customers + expose them on the overview.

alter table customers
  add column if not exists merchant_notes text;

comment on column customers.merchant_notes is
  'Private merchant-only notes about this customer. Never shown to the guest.';

drop view if exists customer_overview;
create view customer_overview with (security_invoker = on) as
  select
    c.id,
    c.merchant_id,
    c.branch_id,
    c.user_id,
    c.name,
    c.phone,
    c.email,
    c.banned,
    c.member_since,
    c.merchant_notes,
    c.created_at,
    coalesce(lc.stamps, 0) as stamps,
    coalesce(lc.status, 'active')::card_status as status,
    m.total_stamps,
    (select count(*) from visits v where v.customer_id = c.id) as lifetime_visits,
    (select max(v.created_at) from visits v where v.customer_id = c.id) as last_visit,
    (select count(*) from redemptions r where r.customer_id = c.id) as rewards_claimed
  from customers c
  join merchants m on m.id = c.merchant_id
  left join loyalty_cards lc on lc.customer_id = c.id;
