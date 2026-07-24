-- Permanent public token for the Customer × Business relationship.
-- Used as the single customer hub URL: https://froq.io/c/{public_token}
-- Generated once; never regenerated on update / re-join.

create or replace function generate_customer_public_token()
returns text
language plpgsql
set search_path = public, extensions
as $$
declare
  candidate text;
  attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    -- frq_ + 12 hex chars from a UUID (stable across schemas; no pgcrypto encode needed)
    candidate := 'frq_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    exit when not exists (
      select 1 from customers where public_token = candidate
    );
    if attempts > 20 then
      raise exception 'Could not allocate a unique public_token';
    end if;
  end loop;
  return candidate;
end;
$$;

alter table customers
  add column if not exists public_token text;

-- Backfill existing rows once.
update customers
set public_token = generate_customer_public_token()
where public_token is null;

alter table customers
  alter column public_token set default generate_customer_public_token();

alter table customers
  alter column public_token set not null;

create unique index if not exists customers_public_token_uidx
  on customers (public_token);

-- Ensure insert always gets a token even if the caller omits it.
create or replace function customers_set_public_token()
returns trigger
language plpgsql
as $$
begin
  if new.public_token is null or btrim(new.public_token) = '' then
    new.public_token := generate_customer_public_token();
  end if;
  return new;
end;
$$;

drop trigger if exists customers_public_token_bi on customers;
create trigger customers_public_token_bi
  before insert on customers
  for each row
  execute function customers_set_public_token();

-- Re-join must NEVER overwrite an existing public_token.
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
    email = coalesce(excluded.email, customers.email),
    branch_id = coalesce(excluded.branch_id, customers.branch_id)
    -- public_token intentionally omitted so it stays permanent
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id, branch_id)
  values (v_customer, v_merchant, v_branch)
  on conflict (customer_id) do nothing;

  return v_customer;
end;
$$;
