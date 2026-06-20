-- Let merchants upload a thumbnail image for their reward, shown to customers
-- on the loyalty card and the reward-claimed celebration.
alter table merchants add column if not exists reward_image_url text;
