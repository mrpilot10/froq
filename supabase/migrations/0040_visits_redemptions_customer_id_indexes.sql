-- Indexes for customer_overview / gap lookups on visits + redemptions.
--
-- Plain CREATE INDEX (not CONCURRENTLY): Supabase migration runner applies
-- statements inside a transaction; CREATE INDEX CONCURRENTLY cannot run in a
-- transaction block, so a CONCURRENTLY version of this file never applied and
-- left fresh environments without these indexes.
--
-- Matches the hand-created production indexes:
--   visits_customer_created_idx  (customer_id, created_at desc)
--   redemptions_customer_idx     (customer_id)
-- and drops the redundant single prefix visits_customer_idx if present.
--
-- Rollback:
--   drop index if exists public.visits_customer_created_idx;
--   drop index if exists public.redemptions_customer_idx;

drop index if exists public.visits_customer_idx;

create index if not exists visits_customer_created_idx
  on public.visits (customer_id, created_at desc);

create index if not exists redemptions_customer_idx
  on public.redemptions (customer_id);

analyze public.visits;
analyze public.redemptions;
