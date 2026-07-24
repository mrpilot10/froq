-- Stamps-to-reward minimum is 5 (was 1).

update merchants
set total_stamps = 5
where total_stamps < 5;

alter table merchants
  drop constraint if exists merchants_total_stamps_check;

alter table merchants
  add constraint merchants_total_stamps_check
  check (total_stamps between 5 and 20);
