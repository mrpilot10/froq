-- 0110: payment-id uniqueness for AI credit packs + Postgres public rate limit.
-- Service-role only. No USING (true) policies.

-- ─── 1. Credit pack payments cannot be applied twice ─────────────────────────
alter table public.menu_ai_credit_grants
  add column if not exists payment_id text;

comment on column public.menu_ai_credit_grants.payment_id is
  'Razorpay payment id for purchased packs. Null for plan allotment grants.';

create unique index if not exists menu_ai_credit_grants_payment_id_uidx
  on public.menu_ai_credit_grants (payment_id)
  where payment_id is not null;

create or replace function public.apply_purchased_ai_credit_pack(
  p_merchant_id uuid,
  p_credits integer,
  p_pack_id text,
  p_payment_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'Credits must be positive';
  end if;
  if p_payment_id is null or length(trim(p_payment_id)) = 0 then
    raise exception 'Payment id is required';
  end if;
  if p_merchant_id is null then
    raise exception 'Merchant is required';
  end if;

  insert into public.menu_ai_credit_grants (
    merchant_id,
    credits,
    reason,
    payment_id
  )
  values (
    p_merchant_id,
    p_credits,
    'purchase:' || coalesce(p_pack_id, 'pack') || ':' || trim(p_payment_id),
    trim(p_payment_id)
  )
  on conflict (payment_id) where payment_id is not null
  do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  update public.merchant_ai_usage
  set
    purchased_credits_remaining = purchased_credits_remaining + p_credits,
    updated_at = now()
  where id = (
    select u.id
    from public.merchant_ai_usage u
    where u.merchant_id = p_merchant_id
    order by u.billing_period desc
    limit 1
  );

  if not found then
    raise exception 'AI credit wallet missing';
  end if;

  return true;
end;
$$;

revoke all on function public.apply_purchased_ai_credit_pack(uuid, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_purchased_ai_credit_pack(uuid, integer, text, text)
  to service_role;

-- ─── 2. Sliding-window public throttle (ip + slug) ───────────────────────────
create table if not exists public.public_rate_hits (
  id bigint generated always as identity primary key,
  scope text not null,
  ip text not null,
  slug text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_rate_hits_window_idx
  on public.public_rate_hits (scope, ip, slug, created_at desc);

alter table public.public_rate_hits enable row level security;

create or replace function public.consume_public_rate_limit(
  p_scope text,
  p_ip text,
  p_slug text,
  p_limit integer,
  p_window_ms integer
)
returns table (allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := left(trim(coalesce(p_scope, '')), 40);
  v_ip text := left(trim(coalesce(p_ip, 'unknown')), 64);
  v_slug text := left(trim(coalesce(p_slug, '')), 80);
  v_count integer;
  v_oldest timestamptz;
  v_cutoff timestamptz;
begin
  if v_scope = '' or v_slug = '' or p_limit is null or p_limit < 1
     or p_window_ms is null or p_window_ms < 1000 then
    return query select false, 60;
    return;
  end if;

  v_cutoff := now() - make_interval(secs => ceil(p_window_ms / 1000.0));

  perform pg_advisory_xact_lock(hashtext(v_scope || chr(31) || v_ip || chr(31) || v_slug));

  delete from public.public_rate_hits
  where created_at < now() - interval '2 hours';

  select count(*)::integer, min(h.created_at)
    into v_count, v_oldest
  from public.public_rate_hits h
  where h.scope = v_scope
    and h.ip = v_ip
    and h.slug = v_slug
    and h.created_at > v_cutoff;

  if coalesce(v_count, 0) >= p_limit then
    return query select
      false,
      greatest(
        1,
        ceil(extract(epoch from (v_oldest + make_interval(secs => ceil(p_window_ms / 1000.0)) - now())))::integer
      );
    return;
  end if;

  insert into public.public_rate_hits (scope, ip, slug)
  values (v_scope, v_ip, v_slug);

  return query select true, 0;
end;
$$;

revoke all on function public.consume_public_rate_limit(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text, text, integer, integer)
  to service_role;
