-- Keep offer copy short for the guest sheet cards.

update public.menu_offers
set
  badge = left(badge, 12),
  title = left(title, 28),
  detail = left(detail, 60)
where char_length(badge) > 12
   or char_length(title) > 28
   or char_length(detail) > 60;

alter table public.menu_offers
  drop constraint if exists menu_offers_badge_len,
  drop constraint if exists menu_offers_title_len,
  drop constraint if exists menu_offers_detail_len;

alter table public.menu_offers
  add constraint menu_offers_badge_len check (char_length(badge) between 1 and 12),
  add constraint menu_offers_title_len check (char_length(title) between 1 and 28),
  add constraint menu_offers_detail_len check (char_length(detail) <= 60);
