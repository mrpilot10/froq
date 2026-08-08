-- Approximate calories per serving, shown to guests beside cook time.
--
-- Nullable because most dishes will never have a figure: it is an estimate the
-- AI writes alongside the description, and "no number" has to stay tellable
-- apart from "zero calories". The guest card hides the row when it is null.
--
-- The ceiling is deliberately generous — a thali or a family-size biryani runs
-- past 2000 — and only exists to reject a model that returns joules.

alter table public.menu_items
  add column if not exists calories integer
  check (calories is null or (calories > 0 and calories <= 5000));

comment on column public.menu_items.calories is
  'Approximate kcal per serving. Null when unknown; never shown as 0.';
