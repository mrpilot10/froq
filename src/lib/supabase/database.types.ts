// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate later with: supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type CardStatus = "active" | "reward_ready" | "claimed";
export type RewardCycleStatus = "collecting" | "waiting" | "ready";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type MerchantProductKind = "loyalty" | "queue" | "reservation" | "menu";
export type ProductStatus = "active" | "past_due" | "canceled";
export type MemberRole = "owner" | "manager" | "staff";
export type RewardCooldownUnit = "hours" | "days" | "weeks";
export type QueueCallStatus = "called" | "seated" | "skipped" | "left";
export type QueueSessionStatus = "live" | "paused" | "ended";
export type QueueEntryStatus = "held" | "waiting" | "called" | "seated" | "left";
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
  /** Contact + links are per-branch as of migration 0069. */
  phone: string | null;
  email: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  x_url: string | null;
  google_business_url: string | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  /** Queue hours + wait estimate are per-branch as of migration 0072. */
  queue_open_time: string;
  queue_close_time: string;
  queue_hours_timezone: string;
  queue_open_days: number[];
  queue_auto_start: boolean;
  queue_auto_close: boolean;
  estimated_wait_minutes: number;
  /** Seats × quantity config — see migration 0073. */
  table_layout?: unknown;
}

export interface MerchantMemberRow {
  id: string;
  merchant_id: string;
  user_id: string;
  role: MemberRole;
  branch_id: string | null;
  branch_ids: string[];
  /** Empty = all products. */
  /** Empty = all products. Optional until migration 0063 is applied. */
  product_ids?: MerchantProductKind[];
  name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  accepted_at: string | null;
  /** AI Menu floor: receiving requests/orders when true. */
  menu_on_floor?: boolean;
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
  google_place_id: string | null;
  google_maps_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  x_url: string | null;
  reward_title: string;
  reward_name: string;
  reward_image_url: string | null;
  total_stamps: number;
  /** Allow customers to start a new stamp card after redeeming (default true). */
  restart_after_reward: boolean;
  /** Wait before next card unlocks after redemption; 0 = none. */
  reward_cooldown_value: number;
  reward_cooldown_unit: RewardCooldownUnit;
  /** Condition: stamps/reward apply with purchase of ₹X+; 0 = none. */
  min_purchase_amount: number;
  stamp_notifications: boolean;
  approval_notifications: boolean;
  /** Escalate pending stamps to staff after 3h (email + in-app). Default true. */
  notify_staff_pending_approvals?: boolean;
  /** Escalate pending stamps to managers after 6h. Default true. */
  notify_manager_pending_approvals?: boolean;
  /** Include owners in escalation reminders. Default false. */
  notify_owner_pending_approvals?: boolean;
  /** Birthday double-stamp promo (notify + award 2×). Default false. */
  birthday_double_stamps?: boolean;
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
  /** 0 = never auto decline pending requests. */
  reservation_auto_decline_hours: number;
  reservation_whatsapp_enabled: boolean;
  /** Merchant stopped taking new online bookings (their own still work). */
  reservation_paused: boolean;
  /**
   * Minutes after reservation time before an unarrived guest is no-show'd
   * and their held queue slot is released. Default 15.
   */
  reservation_grace_minutes: number;
  /** Auto-pick a free table when confirming a booking (migration 0073). */
  reservation_auto_assign_tables?: boolean;
  /** Guests can add dishes and send a table order (migration 0080). */
  menu_table_ordering?: boolean;
  /** Guests can ping staff via Need something? (migration 0080). */
  menu_server_notify?: boolean;
  /** Show Loyalty stamps promo on the guest AI Menu (migration 0103). */
  menu_show_loyalty_stamps?: boolean;
  /** Queue ↔ AI Menu integration (migration 0105). */
  queue_ai_menu_enabled?: boolean;
  /** Percent added to an AI Menu cart, 0 to omit the row (migration 0087). */
  menu_cgst_percent?: number | null;
  menu_sgst_percent?: number | null;
  menu_service_charge_percent?: number | null;
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
  /** Live Razorpay subscription id (`sub_…`), if billed via Subscriptions. */
  razorpay_subscription_id: string | null;
  /** Successful guest AI replies in the current Menu billing cycle. */
  ai_replies_used: number;
  /** Cycle this counter applies to (aligned with current_period_end / trial). */
  ai_replies_cycle_end: string | null;
}

/** One successful guest AI Menu reply (quota + cost analytics). */
export interface MenuAiReplyLogRow {
  id: string;
  merchant_id: string;
  guest_id: string;
  conversation_id: string;
  created_at: string;
  prompt_tokens: number | null;
  response_tokens: number | null;
  thoughts_tokens: number | null;
  total_tokens: number | null;
  model: string | null;
  response_ms: number | null;
}


/** Unified AI Credits wallet for a Menu billing period. */
export interface MerchantAiUsageRow {
  id: string;
  merchant_id: string;
  billing_period: string;
  monthly_credits_total: number;
  monthly_credits_used: number;
  purchased_credits_remaining: number;
  cycle_ends_at: string | null;
  updated_at: string;
}

/** Successful AI action that consumed unified credits. */
export interface AiUsageLogUnifiedRow {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  feature: string;
  credits_used: number;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  thoughts_tokens: number | null;
  estimated_cost_usd: number | null;
  response_ms: number | null;
  created_at: string;
}

/** Dedupes owner billing / usage emails (migration 0092). */
export interface BillingNoticeLogRow {
  id: string;
  merchant_id: string;
  product: string;
  notice_type: string;
  period_key: string;
  sent_at: string;
}

/** One WhatsApp send attempt for platform cost rollups by Meta category. */
export interface WhatsAppMessageLogRow {
  id: string;
  merchant_id: string | null;
  template_name: string;
  category: string;
  cost_inr: number;
  status: string;
  phone_last4: string | null;
  provider_status: string | null;
  provider_message: string | null;
  request_id: string | null;
  source: string;
  created_at: string;
}

/** One Google Places API call for usage / estimated cost metering. */
export interface GooglePlacesUsageRow {
  id: string;
  merchant_id: string | null;
  kind: string;
  path: string;
  status: string;
  cost_usd: number;
  query_chars: number | null;
  result_count: number | null;
  http_status: number | null;
  error_code: string | null;
  created_at: string;
}

/** Per-product activation of a global branch. Creation is uncapped; activation is plan-gated. */
export interface ProductBranchAssignmentRow {
  merchant_id: string;
  product: MerchantProductKind;
  branch_id: string;
  status: "active" | "inactive";
  assigned_at: string;
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
  /** Private merchant-only notes. Never shown to the guest. */
  merchant_notes: string | null;
  /** Date of birth (YYYY-MM-DD). Optional until collected on loyalty join. */
  birthdate: string | null;
  /** Year the last birthday double-stamp notification was sent. */
  birthday_notify_year: number | null;
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
  /** Linked booking when this entry is a held / waiting reservation slot. */
  reservation_id: string | null;
  reservation_time: string | null;
  /**
   * Effective service time: walk-in join time, or reservation datetime for
   * held slots (so walk-ins sort around reservations).
   */
  joined_at: string;
  called_at: string | null;
  accept_by: string | null;
  seated_at: string | null;
  left_at: string | null;
  notified_joined_at: string | null;
  /** Assigned dining table when seated (migration 0073). */
  dining_table_id?: string | null;
  table_number?: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Guest text in every supported language, keyed by language code, alongside a
 * "src" hash of the English it was made from. A mismatch means stale.
 */
export type MenuTranslations = Record<string, Record<string, string> | string>;

export interface MenuCategoryRow {
  id: string;
  merchant_id: string;
  name: string;
  sort_order: number;
  translations: MenuTranslations;
  created_at: string;
  updated_at: string;
}

export interface MenuItemRow {
  id: string;
  merchant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  diet: string[];
  allergens: string[];
  spice_level: number | null;
  prep_minutes: number | null;
  /** Approximate kcal per serving, null when unknown (migration 0088). */
  calories?: number | null;
  is_available: boolean;
  /** 'draft' = merchant-only, 'live' = guest-facing. */
  status: string;
  /** 'manual' = typed in, 'ai' = read out of an upload. */
  source: string;
  sort_order: number;
  translations: MenuTranslations;
  created_at: string;
  updated_at: string;
}

export interface MenuOfferRow {
  id: string;
  merchant_id: string;
  badge: string;
  title: string;
  detail: string;
  is_active: boolean;
  sort_order: number;
  translations: MenuTranslations;
  created_at: string;
  updated_at: string;
}

/** One anonymous guest action on the AI menu — a scan, a question, a cart add. */
export interface MenuEventRow {
  id: string;
  merchant_id: string;
  branch_id: string | null;
  event: string;
  item_id: string | null;
  item_name: string | null;
  lang: string | null;
  detail: string | null;
  session_key: string | null;
  created_at: string;
}

/** One Gemini call, kept for cost reporting. Never holds prompts or answers. */
export interface AiUsageRow {
  id: string;
  merchant_id: string | null;
  feature: string;
  kind: string;
  model: string;
  prompt_tokens: number | null;
  response_tokens: number | null;
  thoughts_tokens: number | null;
  cached_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
}

export interface DiningTableRow {
  id: string;
  merchant_id: string;
  branch_id: string;
  table_number: number;
  seats: number;
  label: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** One visit at one table — the header row behind menu service history. */
export interface MenuDiningSessionRow {
  id: string;
  merchant_id: string;
  branch_id: string;
  dining_table_id: string | null;
  /** Snapshot, so history survives the table leaving inventory. */
  table_number: number | null;
  table_label: string | null;
  customer_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  party_size: number | null;
  /** merchant_members.id of the teammate who looked after the table. */
  served_by: string | null;
  /** 'open' | 'closed' | 'abandoned' */
  status: string;
  opened_at: string;
  closed_at: string | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** One round of dishes sent to the kitchen during a session. */
export interface MenuOrderRow {
  id: string;
  merchant_id: string;
  session_id: string;
  round: number;
  /** 'pending' | 'confirmed' | 'kitchen' | 'served' | 'cancelled' */
  status: string;
  served_by: string | null;
  placed_at: string;
  served_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A dish line, with name and price captured at order time. */
export interface MenuOrderItemRow {
  id: string;
  merchant_id: string;
  order_id: string;
  menu_item_id: string | null;
  name: string;
  unit_price: number | null;
  quantity: number;
  notes: string | null;
  /** When staff marked this dish as delivered to the table. */
  served_at?: string | null;
  created_at: string;
}

/** Guest Need something? request on the floor board. */
export interface MenuStaffRequestRow {
  id: string;
  merchant_id: string;
  branch_id: string;
  session_id: string | null;
  dining_table_id: string | null;
  table_number: number | null;
  table_label: string | null;
  reason_key: string;
  reason_label: string;
  assigned_to: string | null;
  /** 'open' | 'acked' | 'done' | 'cancelled' */
  status: string;
  created_at: string;
  assigned_at: string | null;
  acked_at: string | null;
  completed_at: string | null;
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
  /** Assigned dining table (migration 0073). */
  dining_table_id?: string | null;
  table_number?: number | null;
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

/** One active escalation wave per recipient × level. */
export interface ApprovalEscalationSendRow {
  id: string;
  merchant_id: string;
  user_id: string;
  escalation_level: "3h" | "6h";
  anchor_approval_id: string;
  sent_at: string;
}

export interface MerchantInAppNotificationRow {
  id: string;
  merchant_id: string;
  user_id: string;
  title: string;
  message: string;
  action_label: string | null;
  action_href: string | null;
  kind: string;
  escalation_level: "3h" | "6h" | null;
  read_at: string | null;
  created_at: string;
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
  merchant_notes: string | null;
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
          | "ai_replies_used"
          | "ai_replies_cycle_end"
        >;
        Update: Partial<MerchantProductRow>;
        Relationships: [];
      };
      billing_notice_log: {
        Row: BillingNoticeLogRow;
        Insert: Insert<BillingNoticeLogRow, "id" | "sent_at">;
        Update: Partial<BillingNoticeLogRow>;
        Relationships: [];
      };
      whatsapp_message_log: {
        Row: WhatsAppMessageLogRow;
        Insert: Insert<
          WhatsAppMessageLogRow,
          | "id"
          | "created_at"
          | "merchant_id"
          | "cost_inr"
          | "phone_last4"
          | "provider_status"
          | "provider_message"
          | "request_id"
          | "source"
        >;
        Update: Partial<WhatsAppMessageLogRow>;
        Relationships: [];
      };
      google_places_usage: {
        Row: GooglePlacesUsageRow;
        Insert: Insert<
          GooglePlacesUsageRow,
          | "id"
          | "created_at"
          | "merchant_id"
          | "cost_usd"
          | "query_chars"
          | "result_count"
          | "http_status"
          | "error_code"
          | "path"
        >;
        Update: Partial<GooglePlacesUsageRow>;
        Relationships: [];
      };
      product_branch_assignments: {
        Row: ProductBranchAssignmentRow;
        Insert: Insert<ProductBranchAssignmentRow, "assigned_at" | "status">;
        Update: Partial<ProductBranchAssignmentRow>;
        Relationships: [];
      };
      branches: {
        Row: BranchRow;
        Insert: Insert<
          BranchRow,
          | "id"
          | "created_at"
          | "address"
          | "is_default"
          | "phone"
          | "email"
          | "website_url"
          | "instagram_url"
          | "facebook_url"
          | "x_url"
          | "google_business_url"
          | "google_place_id"
          | "google_maps_url"
          | "queue_open_time"
          | "queue_close_time"
          | "queue_hours_timezone"
          | "queue_open_days"
          | "queue_auto_start"
          | "queue_auto_close"
          | "estimated_wait_minutes"
          | "table_layout"
        >;
        Update: Partial<BranchRow>;
        Relationships: [];
      };
      menu_categories: {
        Row: MenuCategoryRow;
        Insert: Insert<
          MenuCategoryRow,
          "id" | "created_at" | "updated_at" | "sort_order" | "translations"
        >;
        Update: Partial<MenuCategoryRow>;
        Relationships: [];
      };
      menu_items: {
        Row: MenuItemRow;
        Insert: Insert<
          MenuItemRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "description"
          | "price"
          | "diet"
          | "allergens"
          | "spice_level"
          | "prep_minutes"
          | "is_available"
          | "source"
          | "sort_order"
          | "translations"
        >;
        Update: Partial<MenuItemRow>;
        Relationships: [];
      };
      menu_offers: {
        Row: MenuOfferRow;
        Insert: Insert<
          MenuOfferRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "detail"
          | "is_active"
          | "sort_order"
          | "translations"
        >;
        Update: Partial<MenuOfferRow>;
        Relationships: [];
      };
      menu_ai_reply_log: {
        Row: MenuAiReplyLogRow;
        Insert: Insert<
          MenuAiReplyLogRow,
          | "id"
          | "created_at"
          | "prompt_tokens"
          | "response_tokens"
          | "thoughts_tokens"
          | "total_tokens"
          | "model"
          | "response_ms"
        >;
        Update: Partial<MenuAiReplyLogRow>;
        Relationships: [];
      };
      merchant_ai_usage: {
        Row: MerchantAiUsageRow;
        Insert: Insert<
          MerchantAiUsageRow,
          | "id"
          | "monthly_credits_total"
          | "monthly_credits_used"
          | "purchased_credits_remaining"
          | "cycle_ends_at"
          | "updated_at"
        >;
        Update: Partial<MerchantAiUsageRow>;
        Relationships: [];
      };
      ai_usage_log: {
        Row: AiUsageLogUnifiedRow;
        Insert: Insert<
          AiUsageLogUnifiedRow,
          | "id"
          | "created_at"
          | "customer_id"
          | "model"
          | "prompt_tokens"
          | "completion_tokens"
          | "thoughts_tokens"
          | "estimated_cost_usd"
          | "response_ms"
        >;
        Update: Partial<AiUsageLogUnifiedRow>;
        Relationships: [];
      };
      menu_events: {
        Row: MenuEventRow;
        Insert: Insert<
          MenuEventRow,
          | "id"
          | "created_at"
          | "branch_id"
          | "item_id"
          | "item_name"
          | "lang"
          | "detail"
          | "session_key"
        >;
        Update: Partial<MenuEventRow>;
        Relationships: [];
      };
      ai_usage: {
        Row: AiUsageRow;
        Insert: Insert<
          AiUsageRow,
          | "id"
          | "created_at"
          | "kind"
          | "merchant_id"
          | "prompt_tokens"
          | "response_tokens"
          | "thoughts_tokens"
          | "cached_tokens"
          | "total_tokens"
        >;
        Update: Partial<AiUsageRow>;
        Relationships: [];
      };
      dining_tables: {
        Row: DiningTableRow;
        Insert: Insert<
          DiningTableRow,
          "id" | "created_at" | "updated_at" | "label" | "status" | "sort_order"
        >;
        Update: Partial<DiningTableRow>;
        Relationships: [];
      };
      menu_dining_sessions: {
        Row: MenuDiningSessionRow;
        Insert: Insert<
          MenuDiningSessionRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "dining_table_id"
          | "table_number"
          | "table_label"
          | "customer_id"
          | "guest_name"
          | "guest_phone"
          | "party_size"
          | "served_by"
          | "status"
          | "opened_at"
          | "closed_at"
          | "total_amount"
          | "notes"
        >;
        Update: Partial<MenuDiningSessionRow>;
        Relationships: [];
      };
      menu_orders: {
        Row: MenuOrderRow;
        Insert: Insert<
          MenuOrderRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "round"
          | "status"
          | "served_by"
          | "placed_at"
          | "served_at"
        >;
        Update: Partial<MenuOrderRow>;
        Relationships: [];
      };
      menu_order_items: {
        Row: MenuOrderItemRow;
        Insert: Insert<
          MenuOrderItemRow,
          | "id"
          | "created_at"
          | "menu_item_id"
          | "unit_price"
          | "quantity"
          | "notes"
        >;
        Update: Partial<MenuOrderItemRow>;
        Relationships: [];
      };
      menu_staff_requests: {
        Row: MenuStaffRequestRow;
        Insert: Insert<
          MenuStaffRequestRow,
          | "id"
          | "created_at"
          | "updated_at"
          | "session_id"
          | "dining_table_id"
          | "table_number"
          | "table_label"
          | "assigned_to"
          | "status"
          | "assigned_at"
          | "acked_at"
          | "completed_at"
        >;
        Update: Partial<MenuStaffRequestRow>;
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
          | "product_ids"
          | "name"
          | "email"
          | "first_name"
          | "last_name"
          | "phone"
          | "invite_token"
          | "invite_expires_at"
          | "accepted_at"
          | "menu_on_floor"
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
      approval_escalation_sends: {
        Row: ApprovalEscalationSendRow;
        Insert: Insert<ApprovalEscalationSendRow, "id" | "sent_at">;
        Update: Partial<ApprovalEscalationSendRow>;
        Relationships: [];
      };
      merchant_in_app_notifications: {
        Row: MerchantInAppNotificationRow;
        Insert: Insert<
          MerchantInAppNotificationRow,
          | "id"
          | "created_at"
          | "read_at"
          | "action_label"
          | "action_href"
          | "kind"
          | "escalation_level"
        >;
        Update: Partial<MerchantInAppNotificationRow>;
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
          | "reservation_id"
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
          p_birthdate?: string | null;
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
