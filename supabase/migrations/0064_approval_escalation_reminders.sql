-- Escalation reminders for pending stamp approvals (aggregate count UX):
-- 3h → Staff, 6h → Managers; owners only when toggled on.
-- One reminder per recipient per level until the oldest overdue anchor is cleared.

-- ─── Merchant: role-based pending-approval notification toggles ──────────────
alter table merchants
  add column if not exists notify_staff_pending_approvals boolean not null default true,
  add column if not exists notify_manager_pending_approvals boolean not null default true,
  add column if not exists notify_owner_pending_approvals boolean not null default false;

-- ─── Wave tracking: one active send per user × escalation level ──────────────
create table if not exists approval_escalation_sends (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  user_id uuid not null,
  escalation_level text not null check (escalation_level in ('3h', '6h')),
  -- Oldest overdue approval at send time. While this row stays pending,
  -- we do not re-notify this user at this level.
  anchor_approval_id uuid not null references approvals (id) on delete cascade,
  sent_at timestamptz not null default now(),
  unique (merchant_id, user_id, escalation_level)
);

create index if not exists approval_escalation_sends_merchant_idx
  on approval_escalation_sends (merchant_id);

create index if not exists approval_escalation_sends_anchor_idx
  on approval_escalation_sends (anchor_approval_id);

alter table approval_escalation_sends enable row level security;
-- Cron uses the service role; no client policies needed.

-- Pending approvals older than the staff threshold (cron scan helper).
create index if not exists approvals_pending_requested_at_idx
  on approvals (merchant_id, requested_at)
  where status = 'pending';

-- ─── In-app notification centre (per recipient user) ─────────────────────────
create table if not exists merchant_in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants (id) on delete cascade,
  user_id uuid not null,
  title text not null,
  message text not null,
  action_label text,
  action_href text,
  kind text not null default 'approval_escalation',
  escalation_level text check (escalation_level is null or escalation_level in ('3h', '6h')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists merchant_in_app_notifications_user_unread_idx
  on merchant_in_app_notifications (user_id, merchant_id, created_at desc)
  where read_at is null;

create index if not exists merchant_in_app_notifications_user_idx
  on merchant_in_app_notifications (user_id, merchant_id, created_at desc);

alter table merchant_in_app_notifications enable row level security;

drop policy if exists merchant_in_app_notifications_select on merchant_in_app_notifications;
create policy merchant_in_app_notifications_select on merchant_in_app_notifications
  for select using (
    user_id = (select auth.uid())
    and auth_owns_merchant(merchant_id)
  );

drop policy if exists merchant_in_app_notifications_update on merchant_in_app_notifications;
create policy merchant_in_app_notifications_update on merchant_in_app_notifications
  for update using (
    user_id = (select auth.uid())
    and auth_owns_merchant(merchant_id)
  )
  with check (
    user_id = (select auth.uid())
    and auth_owns_merchant(merchant_id)
  );

-- Inserts happen via service role (cron); no client insert policy.
