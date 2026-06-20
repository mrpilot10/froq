import type {
  MerchantCustomer,
  MerchantProfile,
  MerchantStats,
  PendingApproval,
} from "./types";

export const MERCHANT_PROFILE: MerchantProfile = {
  businessName: "Bloom Coffee Co.",
  email: "hello@bloomcoffee.com",
  phone: "+91 98765 43210",
  address: "42 Market Street, San Francisco, CA 94105",
  brandColor: "#2b6f5c",
  websiteUrl: "bloomcoffee.com",
  googleBusinessUrl: "g.page/bloomcoffee",
  instagramUrl: "instagram.com/bloomcoffee",
  facebookUrl: "",
  xUrl: "",
  rewardTitle: "Buy 4 coffees, get your 5th free",
  rewardName: "Free coffee",
  totalStamps: 5,
  avgOrderValue: 220,
  stampNotifications: true,
  approvalNotifications: true,
  marketingEmails: false,
};

export const MERCHANT_STATS: MerchantStats = {
  totalCustomers: 248,
  activeCards: 186,
  stampsToday: 34,
  pendingApprovals: 3,
  rewardsRedeemed: 52,
  avgLifetimeVisits: 8.4,
  weeklyVisits: [18, 24, 21, 29, 34, 27, 34],
};

export const DEMO_CUSTOMERS: MerchantCustomer[] = [
  {
    id: "c1",
    name: "Alex Morgan",
    phone: "+91 98765 43210",
    email: "alex@example.com",
    stamps: 3,
    totalStamps: 5,
    lifetimeVisits: 13,
    status: "active",
    lastVisit: "Today",
    memberSince: "Jun 2026",
  },
  {
    id: "c2",
    name: "Priya Sharma",
    phone: "+91 91234 56789",
    email: "priya@example.com",
    stamps: 5,
    totalStamps: 5,
    lifetimeVisits: 19,
    status: "reward_ready",
    lastVisit: "Today",
    memberSince: "May 2026",
  },
  {
    id: "c3",
    name: "James Chen",
    phone: "+91 99887 76655",
    stamps: 5,
    totalStamps: 5,
    lifetimeVisits: 22,
    status: "claimed",
    lastVisit: "Yesterday",
    memberSince: "Apr 2026",
  },
  {
    id: "c4",
    name: "Sarah Williams",
    phone: "+91 97654 32109",
    stamps: 2,
    totalStamps: 5,
    lifetimeVisits: 7,
    status: "active",
    lastVisit: "Jun 17",
    memberSince: "Jun 2026",
  },
  {
    id: "c5",
    name: "Rahul Mehta",
    phone: "+91 96543 21098",
    stamps: 4,
    totalStamps: 5,
    lifetimeVisits: 14,
    status: "active",
    lastVisit: "Jun 16",
    memberSince: "May 2026",
  },
];

export const DEMO_APPROVALS: PendingApproval[] = [
  {
    id: "a1",
    customerId: "c1",
    customerName: "Alex Morgan",
    phone: "+91 98765 43210",
    requestedAt: "2 min ago",
    stampsBefore: 3,
    totalStamps: 5,
  },
  {
    id: "a2",
    customerId: "c4",
    customerName: "Sarah Williams",
    phone: "+91 97654 32109",
    requestedAt: "18 min ago",
    stampsBefore: 2,
    totalStamps: 5,
  },
  {
    id: "a3",
    customerId: "c5",
    customerName: "Rahul Mehta",
    phone: "+91 96543 21098",
    requestedAt: "1 hr ago",
    stampsBefore: 4,
    totalStamps: 5,
  },
];

export const MERCHANT_PLAN = {
  name: "Growth",
  price: "₹1,499",
  cycle: "/mo",
  status: "Active",
  renewsOn: "Jul 19, 2026",
  features: [
    "Unlimited loyalty members",
    "Real-time approvals & QR scanner",
    "Customer lifetime-value analytics",
  ],
} as const;

export const BRAND_COLORS: Array<{ name: string; value: string }> = [
  { name: "Teal", value: "#2b6f5c" },
  { name: "Forest", value: "#3f6b46" },
  { name: "Ocean", value: "#2f5d7c" },
  { name: "Indigo", value: "#3f4d80" },
  { name: "Plum", value: "#5d3f63" },
  { name: "Wine", value: "#8f3f48" },
  { name: "Terracotta", value: "#9b513c" },
  { name: "Cocoa", value: "#6b4a37" },
  { name: "Mustard", value: "#a8812e" },
  { name: "Charcoal", value: "#2f3438" },
  { name: "Sage", value: "#6fae90" },
  { name: "Sky", value: "#6f9cc4" },
  { name: "Lavender", value: "#9087c6" },
  { name: "Rose", value: "#c67f8c" },
  { name: "Sand", value: "#cf9f5e" },
];

export const FIELD_LIMITS = {
  businessName: 40,
  address: 80,
  email: 60,
  phone: 18,
  rewardTitle: 48,
  rewardName: 28,
  url: 80,
} as const;

export const VALID_REDEEM_CODES: Record<string, { customerName: string; customerId: string }> = {
  "BLOOM-7Q4X9": { customerName: "Priya Sharma", customerId: "c2" },
  "BLOOM-3K8M2": { customerName: "James Chen", customerId: "c3" },
};
