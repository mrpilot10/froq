-- AI Menu joins the product catalogue so merchant_members.product_ids can scope
-- a teammate to it. Postgres requires a new enum value to be committed before
-- anything references it, so this migration adds the value and nothing else.

alter type merchant_product add value if not exists 'menu';
