-- Filtered Realtime (e.g. customer_id=eq.<id>, merchant_id=eq.<id>) only
-- receives UPDATE/DELETE events when the filter column is in REPLICA IDENTITY.
-- Default identity is PRIMARY KEY only (loyalty_cards.id, approvals.id, …),
-- so redeem/approve UPDATEs were silently dropped and the customer card only
-- refreshed on a manual reload.
--
-- FULL includes every column in the WAL payload so those filters match.

alter table loyalty_cards replica identity full;
alter table approvals replica identity full;
alter table redemptions replica identity full;
