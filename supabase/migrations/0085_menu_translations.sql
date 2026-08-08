-- Guest-facing menu text, translated once per language and stored beside the row
-- it belongs to. Keeping it on the row means the guest read path picks
-- translations up through the selects it already runs, with no extra join.
--
-- Shape:
--   {
--     "src": "<hash of the English text these were made from>",
--     "HI":  { "name": "...", "description": "..." },
--     "TA":  { "name": "...", "description": "..." }
--   }
--
-- "src" is what makes a translation expire: when a merchant edits a dish the
-- hash stops matching and the row is queued for retranslation. Until that
-- finishes the guest sees the English text rather than a translation of a
-- description that no longer exists.

alter table public.menu_items
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.menu_categories
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.menu_offers
  add column if not exists translations jsonb not null default '{}'::jsonb;

comment on column public.menu_items.translations is
  'Per-language name/description, keyed by language code, plus "src" staleness hash.';
comment on column public.menu_categories.translations is
  'Per-language name, keyed by language code, plus "src" staleness hash.';
comment on column public.menu_offers.translations is
  'Per-language badge/title/detail, keyed by language code, plus "src" staleness hash.';

-- Rows whose translations have fallen behind their English text. The background
-- worker reads this to find what still needs doing after a bulk import, and it
-- is the only query that runs on a cold cache, so it earns an index.
create index if not exists menu_items_translations_src_idx
  on public.menu_items (merchant_id)
  where translations->>'src' is null;
