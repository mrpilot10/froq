-- 0043: Avoid scoped_visits materialization; one-pass dow/hour marginal modes.
-- Inlines the visits predicate per consumer so the planner can pick
-- visits_created_idx (modes/count) vs visits_customer_created_idx (gaps).
--
-- Drop-and-recreate (no overload left from 0042's 3-arg form).

drop function if exists merchant_loyalty_lifetime_stats(uuid, uuid, text);

create function merchant_loyalty_lifetime_stats(
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
  visit_days as (
    select
      v.customer_id,
      (v.created_at at time zone p_timezone)::date as visit_day
    from visits v
    where v.merchant_id = p_merchant_id
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and v.customer_id is not null
    group by v.customer_id, (v.created_at at time zone p_timezone)::date
  ),
  gaps as (
    select (vd.visit_day - lag(vd.visit_day) over (
      partition by vd.customer_id
      order by vd.visit_day
    ))::numeric as gap_days
    from visit_days vd
  ),
  dow_hour_counts as (
    select
      extract(dow from (v.created_at at time zone p_timezone))::int as dow,
      extract(hour from (v.created_at at time zone p_timezone))::int as hour,
      count(*)::bigint as n
    from visits v
    where v.merchant_id = p_merchant_id
      and (p_branch_id is null or v.branch_id = p_branch_id)
    group by 1, 2
  ),
  day_mode as (
    select d.dow
    from (
      select c.dow, sum(c.n) as n
      from dow_hour_counts c
      group by c.dow
    ) d
    order by d.n desc, d.dow asc
    limit 1
  ),
  hour_mode as (
    select h.hour
    from (
      select c.hour, sum(c.n) as n
      from dow_hour_counts c
      group by c.hour
    ) h
    order by h.n desc, h.hour asc
    limit 1
  )
  select
    (
      select count(*)::bigint
      from visits v
      where v.merchant_id = p_merchant_id
        and (p_branch_id is null or v.branch_id = p_branch_id)
    ),
    (
      select count(*)::bigint
      from redemptions r
      where r.merchant_id = p_merchant_id
        and (p_branch_id is null or r.branch_id = p_branch_id)
    ),
    (select avg(g.gap_days) from gaps g where g.gap_days is not null),
    (select d.dow from day_mode d),
    (select h.hour from hour_mode h);
$$;

grant execute on function merchant_loyalty_lifetime_stats(uuid, uuid, text) to authenticated;
