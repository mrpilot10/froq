-- SUPERSEDED — do not re-run standalone.
-- Replaced by 0042 (3-arg IST) then 0043 (inlined body). Squashed into 0049.
-- Re-running this file against current remote would CREATE a 2-arg overload
-- alongside the live 3-arg function and break PostgREST .rpc() resolution.
--
-- 0041: Per-merchant (optional branch) all-time loyalty scalars for the dashboard.
-- Returns raw values; app applies existing JS rounding/labels.
--
-- Rollback:
--   drop function if exists merchant_loyalty_lifetime_stats(uuid, uuid);

create or replace function merchant_loyalty_lifetime_stats(
  p_merchant_id uuid,
  p_branch_id uuid default null
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
      (sv.created_at at time zone 'UTC')::date as visit_day
    from scoped_visits sv
    where sv.customer_id is not null
    group by sv.customer_id, (sv.created_at at time zone 'UTC')::date
  ),
  gaps as (
    select (vd.visit_day - lag(vd.visit_day) over (
      partition by vd.customer_id
      order by vd.visit_day
    ))::numeric as gap_days
    from visit_days vd
  ),
  day_mode as (
    select extract(dow from (sv.created_at at time zone 'UTC'))::int as dow
    from scoped_visits sv
    group by 1
    order by count(*) desc, 1 asc
    limit 1
  ),
  hour_mode as (
    select extract(hour from (sv.created_at at time zone 'UTC'))::int as hour
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

grant execute on function merchant_loyalty_lifetime_stats(uuid, uuid) to authenticated;
