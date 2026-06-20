import type { BusinessInfo, HistoryEntry } from "./types";

export const DEFAULT_TOTAL_STAMPS = 5;

export const DEMO_BUSINESS: BusinessInfo = {
  name: "Bloom Coffee Co.",
  shortName: "Bloom Coffee",
  address: "42 Market Street, San Francisco, CA 94105",
  brandColor: "#2b6f5c",
  rewardTitle: "Buy 4 coffees,\nget your 5th free",
  rewardSubtitle: "Any handcrafted drink, any size",
  rewardName: "Free coffee",
  rewardDescription:
    "Collect all 5 stamps and redeem any handcrafted drink of your choice, on the house.",
  rewardImage: "/reward-coffee.png",
  totalStamps: DEFAULT_TOTAL_STAMPS,
  socialLinks: {
    instagram: "#",
    whatsapp: "#",
    facebook: "#",
    website: "#",
    googleReviews: "https://search.google.com/local/writereview",
  },
};

export const INITIAL_FILLED = 3;

export const DEMO_CUSTOMER = {
  name: "Alex Morgan",
  initials: "AM",
};

export const REDEEM_CODE = "BLOOM-7Q4X9";

export const DEMO_HISTORY: HistoryEntry[] = [
  {
    id: "h1",
    date: "Jun 18, 2026",
    label: "Stamp collected",
    status: "approved",
  },
  {
    id: "h2",
    date: "Jun 14, 2026",
    label: "Stamp collected",
    status: "approved",
  },
  {
    id: "h3",
    date: "Jun 10, 2026",
    label: "Stamp collected",
    status: "approved",
  },
];
