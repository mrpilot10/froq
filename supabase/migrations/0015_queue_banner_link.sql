-- Optional link a guest is redirected to when they tap the queue banner image.
alter table merchants
  add column if not exists queue_banner_link text;
