// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate later with: supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type CardStatus = "active" | "reward_ready" | "claimed";
export type RewardCycleStatus = "collecting" | "waiting" | "ready";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type MerchantProductKind = "loyalty" | "queue";
export type ProductStatus = "active" | "past_due" | "canceled";
export type MemberRole = "owner" | "manager" | "staff";
export type RewardCooldownUnit = "hours" | "days" | "weeks";

/** App-facing roles. Managers are treated as staff. */
export type AppMemberRole = "owner" | "staff";

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
}

export interface PushSubscriptionRow {
  id: string;
  merchant_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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
        Insert: Insert<MerchantProductRow, "id" | "purchased_at" | "status" | "plan_id" | "onboarded_at">;
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
    };
    Enums: {
      card_status: CardStatus;
      approval_status: ApprovalStatus;
      merchant_product: MerchantProductKind;
      product_status: ProductStatus;
      member_role: MemberRole;
    };
  };
}
