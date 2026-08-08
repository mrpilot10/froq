-- Per-branch contact details, links, and Google listing.
-- Until now every one of these lived on `merchants`, so a multi-location
-- business could only publish one phone number / map link / review page.
alter table branches
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists facebook_url text,
  add column if not exists x_url text,
  add column if not exists google_business_url text,
  add column if not exists google_place_id text,
  add column if not exists google_maps_url text;

-- Seed the existing main branch from the merchant so customer-facing details
-- don't regress for anyone already live.
update branches b set
  address = coalesce(b.address, m.address),
  phone = coalesce(b.phone, m.phone),
  email = coalesce(b.email, m.email),
  website_url = coalesce(b.website_url, m.website_url),
  instagram_url = coalesce(b.instagram_url, m.instagram_url),
  facebook_url = coalesce(b.facebook_url, m.facebook_url),
  x_url = coalesce(b.x_url, m.x_url),
  google_business_url = coalesce(b.google_business_url, m.google_business_url),
  google_place_id = coalesce(b.google_place_id, m.google_place_id),
  google_maps_url = coalesce(b.google_maps_url, m.google_maps_url)
from merchants m
where b.merchant_id = m.id
  and b.is_default;
