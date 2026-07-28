-- 0044: merchant_loyalty_range_stats
-- Range-bounded visit/redemption scalars + fixed-length chart buckets.
-- Caller maps UI presets → (p_start, p_end, p_granularity); labels stay in JS.
--
-- Confirmed in this SQL:
--   • generate_series builds a FULL fixed-length bucket set (4|7|4|12);
--     left join to counts so empty buckets return visit_count = 0 (never omitted).
--   • week = 4 trailing 7-day windows anchored on local end-of-today
--     (23:59:59.999 in p_timezone), inclusive both ends — NOT date_trunc('week').
--   • tod_quad = 00–06, 06–12, 12–18, 18–24 in p_timezone (half-open 6h slots).
--   • month (and UI "all") = 12 calendar months ending the current local month.
--   • All bucketing uses (timestamptz AT TIME ZONE p_timezone), never UTC trunc.
--
-- chart_buckets jsonb elements: { bucket_index, bucket_start, visit_count }
--   bucket_start is timestamptz (local period start interpreted in p_timezone).
--   No label — JS labelers own the axis.

create or replace function merchant_loyalty_range_stats(
  p_merchant_id uuid,
  p_branch_id uuid default null,
  p_start timestamptz default null,
  p_end timestamptz default null,
  p_granularity text default 'day',
  p_timezone text default 'Asia/Kolkata'
)
returns table (
  stamps_in_range bigint,
  rewards_in_range bigint,
  chart_granularity text,
  chart_buckets jsonb
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_granularity text := p_granularity;
  v_end timestamptz := coalesce(p_end, now());
  v_local_now timestamp := (now() at time zone p_timezone);
  v_local_today_start timestamp := date_trunc('day', v_local_now);
  -- Match JS setHours(23, 59, 59, 999) for week-window ends.
  v_local_today_end timestamp :=
    v_local_today_start + interval '1 day' - interval '1 millisecond';
  v_local_month_start timestamp := date_trunc('month', v_local_now);
begin
  if v_granularity not in ('tod_quad', 'day', 'week', 'month') then
    raise exception 'merchant_loyalty_range_stats: invalid p_granularity %', v_granularity
      using errcode = '22023';
  end if;

  return query
  with
  scoped_visits as (
    select v.created_at
    from visits v
    where v.merchant_id = p_merchant_id
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and (p_start is null or v.created_at >= p_start)
      and v.created_at <= v_end
  ),
  scoped_redemptions as (
    select r.redeemed_at
    from redemptions r
    where r.merchant_id = p_merchant_id
      and (p_branch_id is null or r.branch_id = p_branch_id)
      and (p_start is null or r.redeemed_at >= p_start)
      and r.redeemed_at <= v_end
  ),
  -- Fixed bucket skeleton (local timestamps). One branch per granularity.
  bucket_defs as (
    -- tod_quad: 4 half-open 6h slots on local today [00,06) [06,12) [12,18) [18,24)
    select
      gs as bucket_index,
      v_local_today_start + (gs * interval '6 hours') as start_local,
      v_local_today_start + ((gs + 1) * interval '6 hours') as end_local,
      false as end_inclusive
    from generate_series(0, 3) as gs
    where v_granularity = 'tod_quad'

    union all

    -- day: 7 calendar days ending local today; half-open [start, start+1d)
    select
      gs as bucket_index,
      v_local_today_start - ((6 - gs) * interval '1 day') as start_local,
      v_local_today_start - ((6 - gs) * interval '1 day') + interval '1 day' as end_local,
      false as end_inclusive
    from generate_series(0, 6) as gs
    where v_granularity = 'day'

    union all

    -- week: 4 trailing 7-day windows, oldest → newest (bucket_index 0..3).
    -- For k = 3..0: end = today_end - k*7d, start = date(end) - 6d at 00:00.
    -- Inclusive BOTH ends (matches JS: date >= start && date <= end).
    -- NOT date_trunc('week').
    select
      gs as bucket_index,
      date_trunc(
        'day',
        v_local_today_end - ((3 - gs) * interval '7 days')
      ) - interval '6 days' as start_local,
      v_local_today_end - ((3 - gs) * interval '7 days') as end_local,
      true as end_inclusive
    from generate_series(0, 3) as gs
    where v_granularity = 'week'

    union all

    -- month: 12 calendar months ending current local month; half-open [month, next)
    select
      gs as bucket_index,
      v_local_month_start - ((11 - gs) * interval '1 month') as start_local,
      v_local_month_start - ((11 - gs) * interval '1 month') + interval '1 month' as end_local,
      false as end_inclusive
    from generate_series(0, 11) as gs
    where v_granularity = 'month'
  ),
  -- Chart population = same [p_start, p_end] clip as scalars (JS filteredVisits).
  visit_local as (
    select (v.created_at at time zone p_timezone) as local_ts
    from visits v
    where v.merchant_id = p_merchant_id
      and (p_branch_id is null or v.branch_id = p_branch_id)
      and (p_start is null or v.created_at >= p_start)
      and v.created_at <= v_end
  ),
  -- LEFT JOIN from the full skeleton → empty buckets stay as visit_count = 0.
  counted as (
    select
      b.bucket_index,
      b.start_local,
      count(vl.local_ts)::bigint as visit_count
    from bucket_defs b
    left join visit_local vl
      on vl.local_ts >= b.start_local
     and (
       case
         when b.end_inclusive then vl.local_ts <= b.end_local
         else vl.local_ts < b.end_local
       end
     )
    group by b.bucket_index, b.start_local
  ),
  buckets_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket_index', c.bucket_index,
          'bucket_start', (c.start_local at time zone p_timezone),
          'visit_count', c.visit_count
        )
        order by c.bucket_index
      ),
      '[]'::jsonb
    ) as buckets
    from counted c
  )
  select
    (select count(*)::bigint from scoped_visits) as stamps_in_range,
    (select count(*)::bigint from scoped_redemptions) as rewards_in_range,
    v_granularity as chart_granularity,
    (select bj.buckets from buckets_json bj) as chart_buckets;
end;
$$;

grant execute on function merchant_loyalty_range_stats(uuid, uuid, timestamptz, timestamptz, text, text)
  to authenticated;

comment on function merchant_loyalty_range_stats(uuid, uuid, timestamptz, timestamptz, text, text) is
  'Range visit/redemption counts + fixed chart buckets (tod_quad|day|week|month) in p_timezone; empty buckets are zeros via generate_series.';
