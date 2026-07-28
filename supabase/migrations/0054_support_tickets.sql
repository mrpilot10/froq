-- Support tickets raised from /help.
--
-- The form is open to logged-out visitors too, so merchant_id / user_id are
-- nullable and only filled when we can identify the sender. `reference` is the
-- short code shown to the customer and quoted in the confirmation email.
--
-- Writes always go through the service-role client in the server action (it
-- rate-limits and stamps identity), so there is no public insert policy.

create table if not exists support_tickets (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique,
  merchant_id uuid references merchants (id) on delete set null,
  user_id     uuid references auth.users (id) on delete set null,
  name        text not null,
  email       text not null,
  category    text not null,
  subject     text not null,
  message     text not null,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);

create index if not exists support_tickets_email_idx
  on support_tickets (email, created_at desc);
create index if not exists support_tickets_merchant_idx
  on support_tickets (merchant_id, created_at desc);

alter table support_tickets enable row level security;

-- Senders can read their own history; nobody can write through the anon key.
drop policy if exists support_tickets_own_select on support_tickets;
create policy support_tickets_own_select on support_tickets for select
  using (user_id = (select auth.uid()));
