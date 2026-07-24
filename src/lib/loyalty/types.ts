export interface BusinessInfo {
  name: string;
  address: string;
  brandColor: string;
  logoUrl?: string | null;
  rewardTitle: string;
  rewardSubtitle: string;
  rewardName: string;
  rewardDescription: string;
  rewardImage: string;
  totalStamps: number;
  restartAfterReward?: boolean;
  socialLinks: {
    instagram?: string;
    whatsapp?: string;
    facebook?: string;
    website?: string;
    googleReviews?: string;
  };
}

export type AppScreen = "card" | "success";

export type NavTab = "collect" | "history" | "profile";

export interface HistoryEntry {
  id: string;
  date: string;
  label: string;
  status: "approved" | "pending" | "redeemed";
}

export interface RewardCardGroup {
  id: string;
  /** 1-based card number in chronological order (Card 1 is the oldest). */
  index: number;
  status: "active" | "completed";
  stampsCollected: number;
  totalStamps: number;
  rewardName: string;
  /** A stamp request on the current card is awaiting approval. */
  pending?: boolean;
  /** Current card has all stamps and is waiting to be redeemed. */
  rewardReady?: boolean;
  /** Date the reward was redeemed (completed cards only). */
  redeemedDate?: string;
}

export interface LoyaltyState {
  filled: number;
  pending: boolean;
  screen: AppScreen;
}
