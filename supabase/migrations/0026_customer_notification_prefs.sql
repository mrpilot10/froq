-- Track whether a customer can receive WhatsApp, and their preferred channel.
-- Defaults: WhatsApp unknown/unavailable, prefer SMS (avoid WA credit waste).

alter table customers
  add column if not exists whatsapp_available boolean not null default false;

alter table customers
  add column if not exists preferred_notification_channel text not null default 'sms';

alter table customers
  drop constraint if exists customers_preferred_notification_channel_check;

alter table customers
  add constraint customers_preferred_notification_channel_check
  check (preferred_notification_channel in ('sms', 'whatsapp'));

comment on column customers.whatsapp_available is
  'True only after the customer successfully verified an OTP delivered via WhatsApp.';

comment on column customers.preferred_notification_channel is
  'sms | whatsapp. New customers default to sms; set to whatsapp after WA OTP success.';

-- Re-join must never overwrite notification prefs or public_token.
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

  -- New rows get whatsapp_available=false and preferred_notification_channel='sms'
  -- via column defaults. Conflict updates must not touch those columns.
  insert into customers (merchant_id, branch_id, user_id, name, phone, email)
  values (v_merchant, v_branch, auth.uid(), p_name, p_phone, nullif(trim(p_email), ''))
  on conflict (merchant_id, phone)
  do update set
    user_id = excluded.user_id,
    name = excluded.name,
    email = coalesce(excluded.email, customers.email),
    branch_id = coalesce(excluded.branch_id, customers.branch_id)
  returning id into v_customer;

  insert into loyalty_cards (customer_id, merchant_id, branch_id)
  values (v_customer, v_merchant, v_branch)
  on conflict (customer_id) do nothing;

  return v_customer;
end;
$$;
