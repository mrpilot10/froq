-- SUPERSEDED — do not re-run standalone.
-- Body replaced by 0043 (inlined visit predicates). Squashed into 0049.
-- Re-running this file against current remote would OVERWRITE
-- merchant_loyalty_lifetime_stats with the older CTE form and regress gap/mode
-- planner behavior (and undo 0043).
--
-- 0042: Interpret visit calendar day/hour in Asia/Kolkata (param for later per-merchant TZ).
-- Drops the 2-arg overload so PostgREST .rpc() is unambiguous.
--
-- Rollback:
--   drop function if exists merchant_loyalty_lifetime_stats(uuid, uuid, text);

drop function if exists merchant_loyalty_lifetime_stats(uuid, uuid);

create or replace function merchant_loyalty_lifetime_stats(
  p_merchant_id uuid,
  p_branch_id uuid default null,
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  total_visits bigint,
  total_redemptions bigint,
  avg_days_between_visits numeric,
  most_active_dow int,
  most_active_hour int
)
language sql
stable
security invoker
set search_path = public
as $$
  with
  scoped_visits as (
    select v.customer_id, v.created_at
    from visits v
    where v.merchant_id = p_merchant_id
      and (p_branch_id is null or v.branch_id = p_branch_id)
  ),
  scoped_redemptions as (
    select r.id
    from redemptions r
    where r.merchant_id = p_merchant_id
      and (p_branch_id is null or r.branch_id = p_branch_id)
  ),
  visit_days as (
    select
      sv.customer_id,
      (sv.created_at at time zone p_timezone)::date as visit_day
    from scoped_visits sv
    where sv.customer_id is not null
    group by sv.customer_id, (sv.created_at at time zone p_timezone)::date
  ),
  gaps as (
    select (vd.visit_day - lag(vd.visit_day) over (
      partition by vd.customer_id
      order by vd.visit_day
    ))::numeric as gap_days
    from visit_days vd
  ),
  day_mode as (
    select extract(dow from (sv.created_at at time zone p_timezone))::int as dow
    from scoped_visits sv
    group by 1
    order by count(*) desc, 1 asc
    limit 1
  ),
  hour_mode as (
    select extract(hour from (sv.created_at at time zone p_timezone))::int as hour
    from scoped_visits sv
    group by 1
    order by count(*) desc, 1 asc
    limit 1
  )
  select
    (select count(*)::bigint from scoped_visits),
    (select count(*)::bigint from scoped_redemptions),
    (select avg(g.gap_days) from gaps g where g.gap_days is not null),
    (select d.dow from day_mode d),
    (select h.hour from hour_mode h);
$$;

grant execute on function merchant_loyalty_lifetime_stats(uuid, uuid, text) to authenticated;
