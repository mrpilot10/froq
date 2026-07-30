-- Google Places linkage for merchants (onboarding + stamp card settings).
alter table merchants
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text;
