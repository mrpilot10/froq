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

export interface LoyaltyState {
  filled: number;
  pending: boolean;
  screen: AppScreen;
}
