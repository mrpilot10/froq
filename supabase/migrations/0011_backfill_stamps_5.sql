-- Backfill shops created under the old 8-stamp default to the new 5-stamp program,
-- and reconcile existing customer cards.

update merchants
set total_stamps = 5
where total_stamps = 8;

update loyalty_cards lc
set
  stamps = least(lc.stamps, m.total_stamps),
  status = (
    case
      when lc.status = 'claimed' then 'claimed'
      when least(lc.stamps, m.total_stamps) >= m.total_stamps then 'reward_ready'
      else 'active'
    end
  )::card_status
from merchants m
where lc.merchant_id = m.id
  and m.total_stamps = 5;
