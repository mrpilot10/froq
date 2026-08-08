-- Admin infrastructure stats for the Super Admin dashboard.
-- Service-role only — never grant to anon / authenticated.

create or replace function public.admin_infra_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_catalog, extensions
as $$
declare
  result jsonb;
  db_bytes bigint;
  conn_total int;
  conn_active int;
begin
  select pg_database_size(current_database()) into db_bytes;

  select
    count(*)::int,
    count(*) filter (where state = 'active')::int
  into conn_total, conn_active
  from pg_stat_activity
  where datname = current_database();

  result := jsonb_build_object(
    'generated_at', now(),
    'database', jsonb_build_object(
      'name', current_database(),
      'size_bytes', db_bytes,
      'size_pretty', pg_size_pretty(db_bytes),
      'connections_total', conn_total,
      'connections_active', conn_active
    ),
    'tables', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.total_bytes desc)
      from (
        select
          n.nspname || '.' || c.relname as name,
          pg_total_relation_size(c.oid) as total_bytes,
          pg_size_pretty(pg_total_relation_size(c.oid)) as total_pretty,
          pg_relation_size(c.oid) as table_bytes,
          pg_indexes_size(c.oid) as index_bytes,
          coalesce(s.n_live_tup, 0)::bigint as estimated_rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s
          on s.relid = c.oid
        where c.relkind = 'r'
          and n.nspname = 'public'
        order by pg_total_relation_size(c.oid) desc
        limit 20
      ) t
    ), '[]'::jsonb),
    'storage', jsonb_build_object(
      'buckets', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id,
          'name', b.name,
          'public', b.public,
          'created_at', b.created_at,
          'object_count', coalesce(o.cnt, 0),
          'total_bytes', coalesce(o.bytes, 0),
          'total_pretty', pg_size_pretty(coalesce(o.bytes, 0))
        ) order by coalesce(o.bytes, 0) desc)
        from storage.buckets b
        left join lateral (
          select
            count(*)::bigint as cnt,
            coalesce(sum((obj.metadata->>'size')::bigint), 0)::bigint as bytes
          from storage.objects obj
          where obj.bucket_id = b.id
        ) o on true
      ), '[]'::jsonb),
      'bucket_count', (select count(*)::int from storage.buckets),
      'object_count', (select count(*)::int from storage.objects),
      'total_bytes', coalesce((
        select sum((metadata->>'size')::bigint)::bigint from storage.objects
      ), 0),
      'growth_30d', coalesce((
        select jsonb_agg(row_to_json(g)::jsonb order by g.day)
        from (
          select
            (date_trunc('day', created_at at time zone 'utc'))::date as day,
            count(*)::bigint as objects_added,
            coalesce(sum((metadata->>'size')::bigint), 0)::bigint as bytes_added
          from storage.objects
          where created_at >= (now() - interval '30 days')
          group by 1
          order by 1
        ) g
      ), '[]'::jsonb)
    ),
    'realtime', jsonb_build_object(
      'publication', 'supabase_realtime',
      'tables', coalesce((
        select jsonb_agg(jsonb_build_object(
          'schema', schemaname,
          'name', tablename
        ) order by schemaname, tablename)
        from pg_publication_tables
        where pubname = 'supabase_realtime'
      ), '[]'::jsonb),
      'table_count', (
        select count(*)::int
        from pg_publication_tables
        where pubname = 'supabase_realtime'
      ),
      -- Postgres backends for this DB (proxy for load; not WebSocket peak)
      'db_backends_total', conn_total,
      'db_backends_active', conn_active
    ),
    'cache', jsonb_build_object(
      'index_hit_rate', (
        select case
          when (sum(idx_blks_hit) + sum(idx_blks_read)) = 0 then null
          else round(
            (sum(idx_blks_hit)::numeric /
              nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0))::numeric,
            4
          )
        end
        from pg_statio_user_indexes
      ),
      'table_hit_rate', (
        select case
          when (sum(heap_blks_hit) + sum(heap_blks_read)) = 0 then null
          else round(
            (sum(heap_blks_hit)::numeric /
              nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0))::numeric,
            4
          )
        end
        from pg_statio_user_tables
      )
    )
  );

  return result;
end;
$$;

comment on function public.admin_infra_stats() is
  'Super Admin dashboard: DB size, top tables, storage buckets, realtime publication. Service-role only.';

revoke all on function public.admin_infra_stats() from public, anon, authenticated;
grant execute on function public.admin_infra_stats() to service_role;
