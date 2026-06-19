// Hand-written to match supabase/migrations/0001_init.sql.
// Regenerate later with: supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type CardStatus = "active" | "reward_ready" | "claimed";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface MerchantRow {
  id: string;
  owner_user_id: string;
  business_name: string;
  short_name: string;
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
  total_stamps: number;
  avg_order_value: number;
  stamp_notifications: boolean;
  approval_notifications: boolean;
  marketing_emails: boolean;
  slug: string;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  merchant_id: string;
  user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  banned: boolean;
  member_since: string;
  created_at: string;
}

export interface LoyaltyCardRow {
  id: string;
  customer_id: string;
  merchant_id: string;
  stamps: number;
  status: CardStatus;
  created_at: string;
  updated_at: string;
}

export interface VisitRow {
  id: string;
  customer_id: string;
  merchant_id: string;
  amount: number;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  merchant_id: string;
  customer_id: string;
  stamps_before: number;
  status: ApprovalStatus;
  requested_at: string;
  resolved_at: string | null;
}

export interface RedemptionRow {
  id: string;
  merchant_id: string;
  customer_id: string | null;
  code: string;
  redeemed_at: string;
}

export interface CustomerOverviewRow {
  id: string;
  merchant_id: string;
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
      customers: {
        Row: CustomerRow;
        Insert: Insert<CustomerRow, "id" | "created_at" | "banned" | "member_since" | "user_id" | "email">;
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
      join_merchant: { Args: { p_slug: string; p_name: string; p_phone: string }; Returns: string };
      request_stamp: { Args: { p_customer_id: string }; Returns: string };
      approve_stamp: { Args: { p_approval_id: string }; Returns: undefined };
      reject_stamp: { Args: { p_approval_id: string }; Returns: undefined };
      redeem_reward: { Args: { p_customer_id: string; p_code: string }; Returns: undefined };
    };
    Enums: {
      card_status: CardStatus;
      approval_status: ApprovalStatus;
    };
  };
}
