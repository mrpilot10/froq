-- Service history for the AI Menu product: who sat where, what they ordered,
-- and which teammate looked after them.
--
-- Three levels, because a table orders in rounds rather than once:
--   menu_dining_sessions -> one visit at one table
--   menu_orders          -> one round sent to the kitchen during that visit
--   menu_order_items     -> the dishes in that round
--
-- History has to stay readable years after the catalogue changes, so every
-- order line keeps its own copy of the dish name and the price actually
-- charged. Deleting a dish (or a table, or a teammate) nulls the link but
-- never rewrites what happened.

create table if not exists public.menu_dining_sessions (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants (id) on delete cascade,
  branch_id        uuid not null references public.branches (id) on delete cascade,
  -- Null once the table is removed from inventory; table_number keeps the story.
  dining_table_id  uuid references public.dining_tables (id) on delete set null,
  table_number     int,
  table_label      text,
  -- Guests can order without ever identifying themselves.
  customer_id      uuid references public.customers (id) on delete set null,
  guest_name       text,
  guest_phone      text,
  party_size       int check (party_size is null or (party_size >= 1 and party_size <= 50)),
  -- The teammate who looked after the table for the visit.
  served_by        uuid references public.merchant_members (id) on delete set null,
  -- open = still seated, closed = paid and left, abandoned = never ordered.
  status           text not null default 'open'
                   check (status in ('open', 'closed', 'abandoned')),
  opened_at        timestamptz not null default now(),
  closed_at        timestamptz,
  -- Cached sum of the session's order lines; kept in step by trigger below.
  total_amount     numeric(10, 2) not null default 0 check (total_amount >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at)
);

-- History is always read newest-first within a branch, which this index serves.
create index if not exists menu_dining_sessions_branch_idx
  on public.menu_dining_sessions (branch_id, opened_at desc);

create index if not exists menu_dining_sessions_merchant_idx
  on public.menu_dining_sessions (merchant_id, opened_at desc);

create index if not exists menu_dining_sessions_customer_idx
  on public.menu_dining_sessions (customer_id, opened_at desc)
  where customer_id is not null;

create index if not exists menu_dining_sessions_served_by_idx
  on public.menu_dining_sessions (served_by, opened_at desc)
  where served_by is not null;

comment on table public.menu_dining_sessions is
  'One visit at one table: who sat down, who served them, and what it came to.';

create table if not exists public.menu_orders (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  session_id   uuid not null references public.menu_dining_sessions (id) on delete cascade,
  -- Rounds are numbered within a visit so "second round" stays meaningful.
  round        int not null default 1 check (round >= 1),
  -- placed = sent to kitchen, served = on the table, cancelled = struck off.
  status       text not null default 'placed'
               check (status in ('placed', 'served', 'cancelled')),
  -- Usually the session's server, but a different teammate may run a round.
  served_by    uuid references public.merchant_members (id) on delete set null,
  placed_at    timestamptz not null default now(),
  served_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists menu_orders_session_idx
  on public.menu_orders (session_id, round);

create index if not exists menu_orders_merchant_idx
  on public.menu_orders (merchant_id, placed_at desc);

comment on table public.menu_orders is
  'One round of dishes sent to the kitchen during a dining session.';

create table if not exists public.menu_order_items (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references public.merchants (id) on delete cascade,
  order_id      uuid not null references public.menu_orders (id) on delete cascade,
  -- Null once the dish leaves the menu; the snapshot below still reads right.
  menu_item_id  uuid references public.menu_items (id) on delete set null,
  -- What the dish was called and cost on the day, not what it is called today.
  name          text not null,
  unit_price    numeric(10, 2) check (unit_price is null or unit_price >= 0),
  quantity      int not null default 1 check (quantity >= 1 and quantity <= 99),
  -- "no onion", "extra spicy" — whatever the guest asked for.
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists menu_order_items_order_idx
  on public.menu_order_items (order_id);

create index if not exists menu_order_items_menu_item_idx
  on public.menu_order_items (menu_item_id)
  where menu_item_id is not null;

comment on table public.menu_order_items is
  'Dish lines on an order, with the name and price captured at order time.';

create or replace function public.menu_history_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists menu_dining_sessions_touch_updated_at_trg
  on public.menu_dining_sessions;
create trigger menu_dining_sessions_touch_updated_at_trg
  before update on public.menu_dining_sessions
  for each row execute function public.menu_history_touch_updated_at();

drop trigger if exists menu_orders_touch_updated_at_trg on public.menu_orders;
create trigger menu_orders_touch_updated_at_trg
  before update on public.menu_orders
  for each row execute function public.menu_history_touch_updated_at();

-- Keep the session total honest without every writer remembering to sum lines.
-- Cancelled rounds drop out of the total.
create or replace function public.menu_session_recalc_total()
returns trigger
language plpgsql
as $$
declare
  target_order uuid := coalesce(new.order_id, old.order_id);
  target_session uuid;
begin
  select session_id into target_session
  from public.menu_orders
  where id = target_order;

  if target_session is null then
    return coalesce(new, old);
  end if;

  update public.menu_dining_sessions s
  set total_amount = coalesce((
    select sum(i.quantity * coalesce(i.unit_price, 0))
    from public.menu_order_items i
    join public.menu_orders o on o.id = i.order_id
    where o.session_id = target_session
      and o.status <> 'cancelled'
  ), 0)
  where s.id = target_session;

  return coalesce(new, old);
end;
$$;

drop trigger if exists menu_order_items_total_trg on public.menu_order_items;
create trigger menu_order_items_total_trg
  after insert or update or delete on public.menu_order_items
  for each row execute function public.menu_session_recalc_total();

-- Striking a round off has to move the total too, so recalc on status change.
create or replace function public.menu_order_status_recalc_total()
returns trigger
language plpgsql
as $$
begin
  update public.menu_dining_sessions s
  set total_amount = coalesce((
    select sum(i.quantity * coalesce(i.unit_price, 0))
    from public.menu_order_items i
    join public.menu_orders o on o.id = i.order_id
    where o.session_id = new.session_id
      and o.status <> 'cancelled'
  ), 0)
  where s.id = new.session_id;
  return new;
end;
$$;

drop trigger if exists menu_orders_total_trg on public.menu_orders;
create trigger menu_orders_total_trg
  after update of status on public.menu_orders
  for each row execute function public.menu_order_status_recalc_total();

alter table public.menu_dining_sessions enable row level security;
alter table public.menu_orders enable row level security;
alter table public.menu_order_items enable row level security;

drop policy if exists menu_dining_sessions_select on public.menu_dining_sessions;
create policy menu_dining_sessions_select on public.menu_dining_sessions
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_dining_sessions_insert on public.menu_dining_sessions;
create policy menu_dining_sessions_insert on public.menu_dining_sessions
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_dining_sessions_update on public.menu_dining_sessions;
create policy menu_dining_sessions_update on public.menu_dining_sessions
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_dining_sessions_delete on public.menu_dining_sessions;
create policy menu_dining_sessions_delete on public.menu_dining_sessions
  for delete using (auth_owns_merchant(merchant_id));

drop policy if exists menu_orders_select on public.menu_orders;
create policy menu_orders_select on public.menu_orders
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_orders_insert on public.menu_orders;
create policy menu_orders_insert on public.menu_orders
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_orders_update on public.menu_orders;
create policy menu_orders_update on public.menu_orders
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_orders_delete on public.menu_orders;
create policy menu_orders_delete on public.menu_orders
  for delete using (auth_owns_merchant(merchant_id));

drop policy if exists menu_order_items_select on public.menu_order_items;
create policy menu_order_items_select on public.menu_order_items
  for select using (auth_owns_merchant(merchant_id));

drop policy if exists menu_order_items_insert on public.menu_order_items;
create policy menu_order_items_insert on public.menu_order_items
  for insert with check (auth_owns_merchant(merchant_id));

drop policy if exists menu_order_items_update on public.menu_order_items;
create policy menu_order_items_update on public.menu_order_items
  for update using (auth_owns_merchant(merchant_id));

drop policy if exists menu_order_items_delete on public.menu_order_items;
create policy menu_order_items_delete on public.menu_order_items
  for delete using (auth_owns_merchant(merchant_id));
