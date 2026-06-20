-- Allow email on customer join (QR signup collects name, email, phone).

create or replace function join_merchant(
  p_slug text,
  p_name text,
  p_phone text,
  p_email text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_merchant from merchants where slug = p_slug;
  if v_merchant is null then
    raise exception 'Shop not found';
  end if;

  insert into customers (merchant_id, user_id, name, phone, email)
  values (v_merchant, auth.uid(), p_name, p_phone, nullif(trim(p_email), ''))
  on conflict (merchant_id, phone)
  do update set
    user_id = excluded.user_id,
    name = excluded.name,
    email = coalesce(excluded.email, customers.email)
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id)
  values (v_customer, v_merchant)
  on conflict (customer_id) do nothing;

  return v_customer;
end; $$;
