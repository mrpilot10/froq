-- 0046: Trivial RPC for transport/latency control (investigation only).
-- Returns 1. No table access. Used to compare app .rpc() wall time vs SQL editor.

create or replace function ping_select_one()
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select 1;
$$;

grant execute on function ping_select_one() to authenticated;
grant execute on function ping_select_one() to service_role;

comment on function ping_select_one() is
  'TODO-REMOVE investigation control: select 1 for RPC transport timing.';
