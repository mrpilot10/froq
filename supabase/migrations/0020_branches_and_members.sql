-- Multi-branch + team members with roles.
--
-- A merchant (the tenant/business) can now have multiple physical branches and
-- multiple staff members with roles. All existing loyalty + queue data is
-- attributed to a branch. Access control is extended in one place:
-- `auth_owns_merchant` now returns true for the owner OR any active member, so
-- every existing RLS policy automatically works for the whole team.

-- ─── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type member_role as enum ('owner', 'manager', 'staff');
exception when duplicate_object then null; end $$;

-- ─── Branches ────────────────────────────────────────────────────────────────
create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  name        text not null,
  slug        text not null unique,
  address     text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists branches_merchant_idx on branches (merchant_id);

-- ─── Team members ────────────────────────────────────────────────────────────
create table if not exists merchant_members (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'staff',
  -- null branch_id = access to all branches (owners / multi-branch managers).
  branch_id   uuid references branches (id) on delete set null,
  name        text,
  email       text,
  created_at  timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create index if not exists merchant_members_merchant_idx on merchant_members (merchant_id);
create index if not exists merchant_members_user_idx on merchant_members (user_id);

-- ─── Attribute existing data to a branch ─────────────────────────────────────
alter table customers     add column if not exists branch_id uuid references branches (id) on delete set null;
alter table loyalty_cards add column if not exists branch_id uuid references branches (id) on delete set null;
alter table visits        add column if not exists branch_id uuid references branches (id) on delete set null;
alter table approvals     add column if not exists branch_id uuid references branches (id) on delete set null;
alter table redemptions   add column if not exists branch_id uuid references branches (id) on delete set null;
create index if not exists customers_branch_idx on customers (branch_id);

-- ─── Backfill: one default branch + owner membership per merchant ─────────────
insert into branches (merchant_id, name, slug, address, is_default)
select m.id, 'Main branch', m.slug || '-main', m.address, true
from merchants m
where not exists (select 1 from branches b where b.merchant_id = m.id);

-- Point all existing rows at their merchant's default branch.
update customers c
  set branch_id = b.id
  from branches b
  where b.merchant_id = c.merchant_id and b.is_default and c.branch_id is null;

update loyalty_cards lc
  set branch_id = b.id
  from branches b
  where b.merchant_id = lc.merchant_id and b.is_default and lc.branch_id is null;

update visits v
  set branch_id = b.id
  from branches b
  where b.merchant_id = v.merchant_id and b.is_default and v.branch_id is null;

update approvals a
  set branch_id = b.id
  from branches b
  where b.merchant_id = a.merchant_id and b.is_default and a.branch_id is null;

update redemptions r
  set branch_id = b.id
  from branches b
  where b.merchant_id = r.merchant_id and b.is_default and r.branch_id is null;

-- Owner membership for every existing merchant.
insert into merchant_members (merchant_id, user_id, role, name, email)
select m.id, m.owner_user_id, 'owner', m.business_name, m.email
from merchants m
where not exists (
  select 1 from merchant_members mm
  where mm.merchant_id = m.id and mm.user_id = m.owner_user_id
);

-- ─── Access helpers ──────────────────────────────────────────────────────────
-- Owner OR any active member of the merchant.
create or replace function auth_owns_merchant(m_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from merchants where id = m_id and owner_user_id = auth.uid()
  ) or exists (
    select 1 from merchant_members mm where mm.merchant_id = m_id and mm.user_id = auth.uid()
  );
$$;

-- Current user's role for a merchant (owner wins).
create or replace function auth_member_role(m_id uuid)
returns member_role language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from merchants where id = m_id and owner_user_id = auth.uid())
      then 'owner'::member_role
    else (select role from merchant_members mm where mm.merchant_id = m_id and mm.user_id = auth.uid())
  end;
$$;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table branches         enable row level security;
alter table merchant_members enable row level security;

-- Branches are publicly readable (needed for the QR join page); the team writes.
drop policy if exists branches_read on branches;
create policy branches_read on branches for select using (true);

drop policy if exists branches_write on branches;
create policy branches_write on branches for all
  using (auth_owns_merchant(merchant_id))
  with check (auth_owns_merchant(merchant_id));

-- Members: the whole team can see the roster; only the owner manages it.
drop policy if exists members_select on merchant_members;
create policy members_select on merchant_members for select
  using (auth_owns_merchant(merchant_id));

drop policy if exists members_write on merchant_members;
create policy members_write on merchant_members for all
  using (
    exists (select 1 from merchants where id = merchant_id and owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from merchants where id = merchant_id and owner_user_id = auth.uid())
  );

-- ─── customer_overview view: expose branch_id ────────────────────────────────
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

-- ─── DB functions: carry branch_id through ───────────────────────────────────
-- Join now accepts an optional branch slug; falls back to the default branch.
create or replace function join_merchant(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_branch text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_customer uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_merchant from merchants where slug = p_slug;
  if v_merchant is null then
    raise exception 'Shop not found';
  end if;

  if p_branch is not null then
    select id into v_branch from branches where slug = p_branch and merchant_id = v_merchant;
  end if;
  if v_branch is null then
    select id into v_branch from branches where merchant_id = v_merchant and is_default limit 1;
  end if;

  insert into customers (merchant_id, branch_id, user_id, name, phone, email)
  values (v_merchant, v_branch, auth.uid(), p_name, p_phone, nullif(trim(p_email), ''))
  on conflict (merchant_id, phone)
  do update set
    user_id = excluded.user_id,
    name = excluded.name,
    email = coalesce(excluded.email, customers.email)
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id, branch_id)
  values (v_customer, v_merchant, v_branch)
  on conflict (customer_id) do nothing;

  return v_customer;
end; $$;

create or replace function request_stamp(p_customer_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_branch uuid;
  v_stamps int;
  v_status card_status;
  v_approval uuid;
begin
  if not auth_owns_customer(p_customer_id) then
    raise exception 'Not allowed';
  end if;

  select merchant_id, branch_id into v_merchant, v_branch from customers where id = p_customer_id;
  select stamps, status into v_stamps, v_status
  from loyalty_cards where customer_id = p_customer_id;

  if v_status = 'reward_ready' then
    raise exception 'Redeem your current reward with staff before collecting more stamps';
  end if;

  if exists (select 1 from approvals where customer_id = p_customer_id and status = 'pending') then
    raise exception 'A stamp request is already pending';
  end if;

  insert into approvals (merchant_id, branch_id, customer_id, stamps_before)
  values (v_merchant, v_branch, p_customer_id, coalesce(v_stamps, 0))
  returning id into v_approval;

  return v_approval;
end; $$;

create or replace function approve_stamp(p_approval_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
  v_branch uuid;
  v_total int;
  v_aov numeric;
  v_new int;
begin
  select a.merchant_id, a.customer_id, a.branch_id into v_merchant, v_customer, v_branch
  from approvals a where a.id = p_approval_id and a.status = 'pending';
  if v_merchant is null then
    raise exception 'Approval not found';
  end if;
  if not auth_owns_merchant(v_merchant) then
    raise exception 'Not allowed';
  end if;

  select total_stamps, avg_order_value into v_total, v_aov
  from merchants where id = v_merchant;

  update loyalty_cards
    set stamps = least(stamps + 1, v_total)
    where customer_id = v_customer
    returning stamps into v_new;

  update loyalty_cards
    set status = (case when v_new >= v_total then 'reward_ready' else 'active' end)::card_status,
        reward_code = case when v_new >= v_total then gen_reward_code() else null end
    where customer_id = v_customer;

  insert into visits (customer_id, merchant_id, branch_id, amount)
  values (v_customer, v_merchant, v_branch, coalesce(v_aov, 0));

  update approvals set status = 'approved', resolved_at = now() where id = p_approval_id;
end; $$;

create or replace function redeem_reward(p_customer_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_branch uuid; v_status card_status;
begin
  select merchant_id, branch_id, status into v_merchant, v_branch, v_status
  from loyalty_cards where customer_id = p_customer_id;
  if v_merchant is null then raise exception 'Card not found'; end if;
  if not auth_owns_merchant(v_merchant) then raise exception 'Not allowed'; end if;
  if v_status <> 'reward_ready' then raise exception 'Reward not ready'; end if;

  update loyalty_cards
    set stamps = 0, status = 'active', reward_code = null
    where customer_id = p_customer_id;
  insert into redemptions (merchant_id, branch_id, customer_id, code)
  values (v_merchant, v_branch, p_customer_id, p_code);
end; $$;
