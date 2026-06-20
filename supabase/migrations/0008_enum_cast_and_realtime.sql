-- Fixes:
-- 1) approve_stamp failed with "column status is of type card_status but
--    expression is of type text" because the CASE produced an untyped (text)
--    result. Cast the result to card_status explicitly.
-- 2) Ensure Postgres changes stream to subscribed clients (live approvals,
--    cards, redemptions) by adding the tables to the supabase_realtime
--    publication.

create or replace function approve_stamp(p_approval_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_merchant uuid;
  v_customer uuid;
  v_total int;
  v_aov numeric;
  v_new int;
begin
  select a.merchant_id, a.customer_id into v_merchant, v_customer
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
    set status = (case when v_new >= v_total then 'reward_ready' else 'active' end)::card_status
    where customer_id = v_customer;

  insert into visits (customer_id, merchant_id, amount)
  values (v_customer, v_merchant, coalesce(v_aov, 0));

  update approvals set status = 'approved', resolved_at = now() where id = p_approval_id;
end; $$;

-- Realtime publication (idempotent — ignore if already a member).
do $$ begin
  alter publication supabase_realtime add table approvals;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table loyalty_cards;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table redemptions;
exception when duplicate_object then null; end $$;
