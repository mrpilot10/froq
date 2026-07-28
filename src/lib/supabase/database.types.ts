// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate later with: supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type CardStatus = "active" | "reward_ready" | "claimed";
export type RewardCycleStatus = "collecting" | "waiting" | "ready";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type MerchantProductKind = "loyalty" | "queue" | "reservation";
export type ProductStatus = "active" | "past_due" | "canceled";
export type MemberRole = "owner" | "manager" | "staff";
export type RewardCooldownUnit = "hours" | "days" | "weeks";
export type QueueCallStatus = "called" | "seated" | "skipped" | "left";
export type QueueSessionStatus = "live" | "paused" | "ended";
export type QueueEntryStatus = "waiting" | "called" | "seated" | "left";
export type QueueEntryKind = "walkin" | "reservation";
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "declined"
  | "cancelled"
  | "completed"
  | "no_show";

/** App-facing roles used across merchant UI + actions. */
export type AppMemberRole = "owner" | "manager" | "staff";

export interface BranchRow {
  id: string;
  merchant_id: string;
  name: string;
  slug: string;
  address: string | null;
  is_default: boolean;
  created_at: string;
}

export interface MerchantMemberRow {
  id: string;
  merchant_id: string;
  user_id: string;
  role: MemberRole;
  branch_id: string | null;
  branch_ids: string[];
  name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface MerchantRow {
  id: string;
  owner_user_id: string;
  business_name: string;
  short_name: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  brand_color: string;
  logo_url: string | null;
  website_url: string | null;
  google_business_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  x_url: string | null;
  reward_title: string;
  reward_name: string;
  reward_image_url: string | null;
  total_stamps: number;
  avg_order_value: number;
  /** Allow customers to start a new stamp card after redeeming (default true). */
  restart_after_reward: boolean;
  /** Wait before next card unlocks after redemption; 0 = none. */
  reward_cooldown_value: number;
  reward_cooldown_unit: RewardCooldownUnit;
  /** Condition: stamps/reward apply with purchase of ₹X+; 0 = none. */
  min_purchase_amount: number;
  stamp_notifications: boolean;
  approval_notifications: boolean;
  marketing_emails: boolean;
  queue_banner: string | null;
  queue_banner_link: string | null;
  /** Local open time for queue auto-start. */
  queue_open_time: string;
  /** Local close time for queue auto-close. */
  queue_close_time: string;
  queue_hours_timezone: string;
  /** 0=Sunday … 6=Saturday. */
  queue_open_days: number[];
  queue_auto_start: boolean;
  queue_auto_close: boolean;
  /** Short line shown above the public reservation form. */
  reservation_description: string | null;
  reservation_max_party_size: number;
  /** Minutes between bookable slots on the public form. */
  reservation_interval_minutes: number;
  reservation_open_time: string;
  reservation_close_time: string;
  reservation_allow_same_day: boolean;
  reservation_allow_notes: boolean;
  /** 0 = never auto decline (future automation). */
  reservation_auto_decline_hours: number;
  reservation_whatsapp_enabled: boolean;
  /** Merchant stopped taking new online bookings (their own still work). */
  reservation_paused: boolean;
  slug: string;
  created_at: string;
}

export interface MerchantProductRow {
  id: string;
  merchant_id: string;
  product: MerchantProductKind;
  plan_id: string | null;
  status: ProductStatus;
  purchased_at: string;
  onboarded_at: string | null;
  pending_plan_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
}

export interface CustomerRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  banned: boolean;
  member_since: string;
  created_at: string;
  /** Permanent Customer × Business public hub token (`frq_…`). Never regenerated. */
  public_token: string;
  /** True only after a successful WhatsApp OTP verification. */
  whatsapp_available: boolean;
  /** Preferred outbound channel for customer notifications. */
  preferred_notification_channel: "sms" | "whatsapp";
}

export interface QueueSessionRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  number: number;
  status: QueueSessionStatus;
  started_at: string;
  ended_at: string | null;
  /** Teammate who started the session; name/role snapshotted at start time. */
  started_by_user_id: string | null;
  started_by_name: string | null;
  started_by_role: MemberRole | null;
  created_at: string;
  updated_at: string;
}

export interface QueueEntryRow {
  id: string;
  merchant_id: string;
  session_id: string;
  branch_id: string | null;
  customer_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  party_size: number;
  kind: QueueEntryKind;
  status: QueueEntryStatus;
  reservation_time: string | null;
  joined_at: string;
  called_at: string | null;
  accept_by: string | null;
  seated_at: string | null;
  left_at: string | null;
  notified_joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReservationRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  reservation_number: number;
  /** Permanent `rsv_…` token behind the guest's reservation page. */
  public_token: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_whatsapp: string | null;
  party_size: number;
  /** YYYY-MM-DD in the merchant's local timezone. */
  reservation_date: string;
  /** HH:MM(:SS) local time. */
  reservation_time: string;
  status: ReservationStatus;
  notes: string | null;
  merchant_notes: string | null;
  decline_reason: string | null;
  /** Set when the merchant proposed a different slot (status stays pending). */
  suggested_at: string | null;
  /** The proposed slot, held until the guest accepts it on their page. */
  suggested_date: string | null;
  suggested_time: string | null;
  suggestion_accepted_at: string | null;
  confirmed_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  /** Who cancelled: "merchant" or "customer". */
  cancelled_by: string | null;
  completed_at: string | null;
  no_show_at: string | null;
  reminder_24h_sent_at: string | null;
  reminder_2h_sent_at: string | null;
  reminder_30m_sent_at: string | null;
  /** Last send that never reached the guest; cleared once one succeeds. */
  notify_failed_template: string | null;
  notify_failed_reason: string | null;
  notify_failed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One attributed action on a booking — see 0060_reservation_events.sql. */
export interface ReservationEventRow {
  id: string;
  reservation_id: string;
  merchant_id: string;
  event: string;
  /** staff | guest | system. */
  actor_kind: string;
  actor_user_id: string | null;
  /** Name and role snapshotted when the action happened; never backfilled. */
  actor_name: string | null;
  actor_role: string | null;
  detail: string | null;
  created_at: string;
}

/** Tracks a called queue party for WhatsApp reminder cron (+3 / +7 / +9 min). */
export interface QueueCallJobRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  client_entry_id: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  party_size: number;
  status: QueueCallStatus;
  called_at: string;
  called_notified_at: string | null;
  call_notify_processing_at: string | null;
  reminder_1_scheduled_at: string;
  reminder_2_scheduled_at: string;
  reminder_3_scheduled_at: string;
  reminder_1_sent_at: string | null;
  reminder_2_sent_at: string | null;
  reminder_3_sent_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoyaltyCardRow {
  id: string;
  customer_id: string;
  merchant_id: string;
  branch_id: string | null;
  stamps: number;
  status: CardStatus;
  reward_code: string | null;
  /** Stamp-collection lock after redeem (not QR wait). */
  cooldown_until: string | null;
  last_stamp_assigned_at: string | null;
  reward_unlock_at: string | null;
  reward_unlocked_at: string | null;
  reward_ready_message_sent: boolean;
  reward_status: RewardCycleStatus;
  /** @deprecated Prefer reward_ready_message_sent */
  reward_wait_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisitRow {
  id: string;
  customer_id: string;
  merchant_id: string;
  branch_id: string | null;
  amount: number;
  created_at: string;
  /** Teammate who granted the stamp; null for rows written before 0052. */
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  performed_by_role: MemberRole | null;
}

export interface ApprovalRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  customer_id: string;
  stamps_before: number;
  status: ApprovalStatus;
  requested_at: string;
  resolved_at: string | null;
}

export interface RedemptionRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  customer_id: string | null;
  code: string;
  redeemed_at: string;
  /** Teammate who redeemed the reward; null for rows written before 0052. */
  performed_by_user_id: string | null;
  performed_by_name: string | null;
  performed_by_role: MemberRole | null;
}

export interface PushSubscriptionRow {
  id: string;
  merchant_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface SupportTicketRow {
  id: string;
  reference: string;
  merchant_id: string | null;
  user_id: string | null;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
}

export interface CustomerOverviewRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  banned: boolean;
  member_since: string;
  created_at: string;
  stamps: number;
  status: CardStatus;
  total_stamps: number;
  lifetime_visits: number;
  rewards_claimed: number;
  last_visit: string | null;
}

type Insert<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

export interface Database {
  public: {
    Tables: {
      merchants: {
        Row: MerchantRow;
        Insert: Insert<MerchantRow, "id" | "created_at" | "logo_url" | "email" | "phone" | "address">;
        Update: Partial<MerchantRow>;
        Relationships: [];
      };
      merchant_products: {
        Row: MerchantProductRow;
        Insert: Insert<
          MerchantProductRow,
          | "id"
          | "purchased_at"
          | "status"
          | "plan_id"
          | "onboarded_at"
          | "pending_plan_id"
          | "cancel_at_period_end"
          | "current_period_end"
        >;
        Update: Partial<MerchantProductRow>;
        Relationships: [];
      };
      branches: {
        Row: BranchRow;
        Insert: Insert<BranchRow, "id" | "created_at" | "address" | "is_default">;
        Update: Partial<BranchRow>;
        Relationships: [];
      };
      merchant_members: {
        Row: MerchantMemberRow;
        Insert: Insert<
          MerchantMemberRow,
          | "id"
          | "created_at"
          | "role"
          | "branch_id"
          | "branch_ids"
          | "name"
          | "email"
          | "first_name"
          | "last_name"
          | "phone"
          | "invite_token"
          | "invite_expires_at"
          | "accepted_at"
        >;
        Update: Partial<MerchantMemberRow>;
        Relationships: [];
      };
      customers: {
        Row: CustomerRow;
        Insert: Insert<
          CustomerRow,
          | "id"
          | "created_at"
          | "banned"
          | "member_since"
          | "user_id"
          | "email"
          | "public_token"
          | "whatsapp_available"
          | "preferred_notification_channel"
        >;
        Update: Partial<CustomerRow>;
        Relationships: [];
      };
      loyalty_cards: {
        Row: LoyaltyCardRow;
        Insert: Insert<LoyaltyCardRow, "id" | "created_at" | "updated_at" | "stamps" | "status">;
        Update: Partial<LoyaltyCardRow>;
        Relationships: [];
      };
      visits: {
        Row: VisitRow;
        Insert: Insert<VisitRow, "id" | "created_at" | "amount">;
        Update: Partial<VisitRow>;
        Relationships: [];
      };
      approvals: {
        Row: ApprovalRow;
        Insert: Insert<ApprovalRow, "id" | "requested_at" | "resolved_at" | "status">;
        Update: Partial<ApprovalRow>;
        Relationships: [];
      };
      redemptions: {
        Row: RedemptionRow;
        Insert: Insert<RedemptionRow, "id" | "redeemed_at" | "customer_id">;
        Update: Partial<RedemptionRow>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Insert<PushSubscriptionRow, "id" | "created_at">;
        Update: Partial<PushSubscriptionRow>;
        Relationships: [];
      };
      support_tickets: {
        Row: SupportTicketRow;
        Insert: Insert<SupportTicketRow, "id" | "created_at" | "status">;
        Update: Partial<SupportTicketRow>;
        Relationships: [];
      };
      queue_call_jobs: {
        Row: QueueCallJobRow;
        Insert: Insert<
          QueueCallJobRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "called_at"
          | "called_notified_at"
          | "call_notify_processing_at"
          | "reminder_1_sent_at"
          | "reminder_2_sent_at"
          | "reminder_3_sent_at"
          | "resolved_at"
          | "customer_id"
          | "branch_id"
        >;
        Update: Partial<QueueCallJobRow>;
        Relationships: [];
      };
      queue_sessions: {
        Row: QueueSessionRow;
        Insert: Insert<
          QueueSessionRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "started_at"
          | "ended_at"
          | "branch_id"
          | "started_by_user_id"
          | "started_by_name"
          | "started_by_role"
        >;
        Update: Partial<QueueSessionRow>;
        Relationships: [];
      };
      queue_entries: {
        Row: QueueEntryRow;
        Insert: Insert<
          QueueEntryRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "kind"
          | "joined_at"
          | "called_at"
          | "accept_by"
          | "seated_at"
          | "left_at"
          | "notified_joined_at"
          | "customer_id"
          | "branch_id"
          | "email"
          | "reservation_time"
        >;
        Update: Partial<QueueEntryRow>;
        Relationships: [];
      };
      reservations: {
        Row: ReservationRow;
        Insert: Insert<
          ReservationRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "status"
          | "reservation_number"
          | "public_token"
          | "branch_id"
          | "customer_id"
          | "customer_whatsapp"
          | "notes"
          | "merchant_notes"
          | "decline_reason"
          | "suggested_at"
          | "suggested_date"
          | "suggested_time"
          | "suggestion_accepted_at"
          | "confirmed_at"
          | "declined_at"
          | "cancelled_at"
          | "cancelled_by"
          | "completed_at"
          | "no_show_at"
          | "reminder_24h_sent_at"
          | "reminder_2h_sent_at"
          | "reminder_30m_sent_at"
          | "notify_failed_template"
          | "notify_failed_reason"
          | "notify_failed_at"
        >;
        Update: Partial<ReservationRow>;
        Relationships: [];
      };
      reservation_events: {
        Row: ReservationEventRow;
        Insert: Insert<
          ReservationEventRow,
          | "id"
          | "created_at"
          | "actor_kind"
          | "actor_user_id"
          | "actor_name"
          | "actor_role"
          | "detail"
        >;
        Update: Partial<ReservationEventRow>;
        Relationships: [];
      };
    };
    Views: {
      merchant_stats: {
        Row: {
          merchant_id: string;
          total_customers: number;
          active_cards: number;
          stamps_today: number;
          pending_approvals: number;
          rewards_redeemed: number;
          avg_lifetime_visits: number;
        };
        Relationships: [];
      };
      customer_overview: {
        Row: CustomerOverviewRow;
        Relationships: [];
      };
    };
    Functions: {
      join_merchant: {
        Args: {
          p_slug: string;
          p_name: string;
          p_phone: string;
          p_email?: string | null;
          p_branch?: string | null;
        };
        Returns: string;
      };
      request_stamp: { Args: { p_customer_id: string }; Returns: string };
      approve_stamp: { Args: { p_approval_id: string }; Returns: undefined };
      reject_stamp: { Args: { p_approval_id: string }; Returns: undefined };
      offer_stamp: { Args: { p_customer_id: string }; Returns: number };
      redeem_reward: { Args: { p_customer_id: string; p_code: string }; Returns: undefined };
      merchant_loyalty_lifetime_stats: {
        Args: {
          p_merchant_id: string;
          p_branch_id?: string | null;
          p_timezone?: string;
        };
        Returns: {
          total_visits: number;
          total_redemptions: number;
          avg_days_between_visits: number | null;
          most_active_dow: number | null;
          most_active_hour: number | null;
        }[];
      };
    };
    Enums: {
      card_status: CardStatus;
      approval_status: ApprovalStatus;
      merchant_product: MerchantProductKind;
      product_status: ProductStatus;
      member_role: MemberRole;
      reservation_status: ReservationStatus;
    };
  };
}
