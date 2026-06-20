-- Default loyalty cards to a 5-stamp program (collect 5 to claim the reward).
alter table merchants
  alter column total_stamps set default 5;
