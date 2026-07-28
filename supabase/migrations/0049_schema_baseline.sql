-- 0049: Squashed baseline for everything 0040–0048 put in place by hand.
--
-- Source of truth: live remote (pg_get_functiondef / pg_indexes / pg_policies),
-- not the intermediate 0040–0048 files. Those remain as history; 0041/0042/0047
-- must never be re-run standalone (see their SUPERSEDED headers).
--
-- Idempotent: safe to run against the current remote as a no-op (aside from
-- deliberately dropping diagnostic ping_select_one).
--
-- ping_select_one: DROPPED here — investigation-only TODO-REMOVE control.

-- ─── 0040: customer_id indexes ───────────────────────────────────────────────
drop index if exists public.visits_customer_idx;

create index if not exists visits_customer_created_idx
  on public.visits (customer_id, created_at desc);

create index if not exists redemptions_customer_idx
  on public.redemptions (customer_id);

-- ─── Lifetime RPC: ensure only the live 3-arg inlined form exists ────────────
drop function if exists public.merchant_loyalty_lifetime_stats(uuid, uuid);

create or replace function public.merchant_loyalty_lifetime_stats(p_merchant_id uuid, p_branch_id uuid default null, p_timezone text default 'Asia/Kolkata')
 returns table(total_visits bigint, total_redemptions bigint, avg_days_between_visits numeric, most_active_dow int, most_active_hour int)
 language sql
stable
 set search_path = public
as $fn$
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
$fn$;

grant execute on function public.merchant_loyalty_lifetime_stats(uuid, uuid, text)
  to authenticated;

-- ─── Range RPC (live body) ───────────────────────────────────────────────────
create or replace function public.merchant_loyalty_range_stats(p_merchant_id uuid, p_branch_id uuid default null, p_start timestamp with time zone default null, p_end timestamp with time zone default null, p_granularity text default 'day', p_timezone text default 'Asia/Kolkata')
 returns table(stamps_in_range bigint, rewards_in_range bigint, chart_granularity text, chart_buckets jsonb)
 language plpgsql
stable
 set search_path = public
as $fn$
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
$fn$;

grant execute on function public.merchant_loyalty_range_stats(uuid, uuid, timestamptz, timestamptz, text, text)
  to authenticated;

comment on function public.merchant_loyalty_range_stats(uuid, uuid, timestamptz, timestamptz, text, text) is
  'Range visit/redemption counts + fixed chart buckets (tod_quad|day|week|month) in p_timezone; empty buckets are zeros via generate_series.';

-- ─── Drop diagnostic ping (0046) ─────────────────────────────────────────────
drop function if exists public.ping_select_one();

-- ─── Auth helpers (0047 bodies + 0048 set-returning) ─────────────────────────
create or replace function public.auth_owns_merchant(m_id uuid)
 returns boolean
 language sql
 stable
security definer
 set search_path = public
as $fn$
  select exists (
    select 1 from merchants
    where id = m_id and owner_user_id = (select auth.uid())
  ) or exists (
    select 1 from merchant_members mm
    where mm.merchant_id = m_id and mm.user_id = (select auth.uid())
  );
$fn$;

create or replace function public.auth_owns_customer(c_id uuid)
 returns boolean
 language sql
 stable
security definer
 set search_path = public
as $fn$
  select exists (
    select 1 from customers
    where id = c_id and user_id = (select auth.uid())
  );
$fn$;

create or replace function public.auth_member_role(m_id uuid)
 returns member_role
 language sql
 stable
security definer
 set search_path = public
as $fn$
  select case
    when exists (
      select 1 from merchants
      where id = m_id and owner_user_id = (select auth.uid())
    ) then 'owner'::member_role
    else (
      select role from merchant_members mm
      where mm.merchant_id = m_id and mm.user_id = (select auth.uid())
    )
  end;
$fn$;

create or replace function public.auth_user_merchant_ids()
 returns SETOF uuid
 language sql
 stable
security definer
 set search_path = public
as $fn$
  select id
  from merchants
  where owner_user_id = (select auth.uid())
  union
  select merchant_id
  from merchant_members
  where user_id = (select auth.uid());
$fn$;

create or replace function public.auth_user_customer_ids()
 returns SETOF uuid
 language sql
 stable
security definer
 set search_path = public
as $fn$
  select id
  from customers
  where user_id = (select auth.uid());
$fn$;

grant execute on function public.auth_user_merchant_ids() to authenticated;
grant execute on function public.auth_user_customer_ids() to authenticated;

-- ─── Write policy splits (0047) ──────────────────────────────────────────────
drop policy if exists visits_write on visits;
drop policy if exists visits_insert on visits;
drop policy if exists visits_update on visits;
drop policy if exists visits_delete on visits;
create policy visits_insert on visits
  for insert with check (auth_owns_merchant(merchant_id));
create policy visits_update on visits
  for update
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));
create policy visits_delete on visits
  for delete using (auth_owns_merchant(merchant_id));

drop policy if exists redemptions_write on redemptions;
drop policy if exists redemptions_insert on redemptions;
drop policy if exists redemptions_update on redemptions;
drop policy if exists redemptions_delete on redemptions;
create policy redemptions_insert on redemptions
  for insert with check (auth_owns_merchant(merchant_id));
create policy redemptions_update on redemptions
  for update
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));
create policy redemptions_delete on redemptions
  for delete using (auth_owns_merchant(merchant_id));

drop policy if exists cards_write on loyalty_cards;
drop policy if exists cards_insert on loyalty_cards;
drop policy if exists cards_update on loyalty_cards;
drop policy if exists cards_delete on loyalty_cards;
create policy cards_insert on loyalty_cards
  for insert
  with check (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));
create policy cards_update on loyalty_cards
  for update
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id))
  with check (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));
create policy cards_delete on loyalty_cards
  for delete
  using (auth_owns_merchant(merchant_id) or auth_owns_customer(customer_id));

drop policy if exists customers_insert on customers;
create policy customers_insert on customers for insert
  with check (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists customers_update on customers;
create policy customers_update on customers for update
  using (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  )
  with check (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists customers_delete on customers;
create policy customers_delete on customers for delete
  using (
    auth_owns_merchant(merchant_id) or user_id = (select auth.uid())
  );

drop policy if exists merchants_insert on merchants;
create policy merchants_insert on merchants for insert
  with check (owner_user_id = (select auth.uid()));

drop policy if exists merchants_update on merchants;
create policy merchants_update on merchants for update
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

drop policy if exists merchants_delete on merchants;
create policy merchants_delete on merchants for delete
  using (owner_user_id = (select auth.uid()));

drop policy if exists members_write on merchant_members;
create policy members_write on merchant_members for all
  using (
    exists (
      select 1 from merchants
      where id = merchant_id and owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from merchants
      where id = merchant_id and owner_user_id = (select auth.uid())
    )
  );

drop policy if exists merchant_products_owner_all on merchant_products;
create policy merchant_products_owner_all on merchant_products for all
  using (
    exists (
      select 1 from merchants m
      where m.id = merchant_products.merchant_id
        and m.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from merchants m
      where m.id = merchant_products.merchant_id
        and m.owner_user_id = (select auth.uid())
    )
  );

-- ─── InitPlan SELECT policies (0048 / live) ──────────────────────────────────
-- Live Postgres prints IN (SELECT …); = any (select …) is equivalent.

drop policy if exists visits_select on visits;
create policy visits_select on visits for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists redemptions_select on redemptions;
create policy redemptions_select on redemptions for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists cards_select on loyalty_cards;
create policy cards_select on loyalty_cards for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists approvals_select on approvals;
create policy approvals_select on approvals for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or customer_id = any (select auth_user_customer_ids())
  );

drop policy if exists customers_select on customers;
create policy customers_select on customers for select
  using (
    merchant_id = any (select auth_user_merchant_ids())
    or user_id = (select auth.uid())
  );

drop policy if exists members_select on merchant_members;
create policy members_select on merchant_members for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists queue_call_jobs_select on queue_call_jobs;
create policy queue_call_jobs_select on queue_call_jobs for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists queue_sessions_select on queue_sessions;
create policy queue_sessions_select on queue_sessions for select
  using (merchant_id = any (select auth_user_merchant_ids()));

drop policy if exists queue_entries_select on queue_entries;
create policy queue_entries_select on queue_entries for select
  using (merchant_id = any (select auth_user_merchant_ids()));
