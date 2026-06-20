-- Normalize phone lookup for auth_user_id_by_phone (+ prefix optional).

create or replace function public.auth_user_id_by_phone(p_phone text)
returns uuid language sql security definer set search_path = auth, public as $$
  select id from auth.users
  where replace(phone, '+', '') = replace(p_phone, '+', '')
  limit 1;
$$;

revoke all on function public.auth_user_id_by_phone(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_phone(text) to service_role;
