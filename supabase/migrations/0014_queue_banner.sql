-- Merchant-configurable banner shown to guests on the queue-join page.
alter table merchants
  add column if not exists queue_banner text;
