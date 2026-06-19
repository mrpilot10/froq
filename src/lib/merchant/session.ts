import type { MerchantCustomer, MerchantProfile, PendingApproval } from "./types";
import {
  DEMO_APPROVALS,
  DEMO_CUSTOMERS,
  MERCHANT_PROFILE,
  MERCHANT_STATS,
} from "./constants";

const STORAGE_KEY = "froq-merchant-v2";

export interface MerchantSession {
  profile: MerchantProfile;
  customers: MerchantCustomer[];
  approvals: PendingApproval[];
  usedCodes: string[];
  stats: typeof MERCHANT_STATS;
}

function defaultSession(): MerchantSession {
  return {
    profile: { ...MERCHANT_PROFILE },
    customers: DEMO_CUSTOMERS.map((c) => ({ ...c })),
    approvals: DEMO_APPROVALS.map((a) => ({ ...a })),
    usedCodes: [],
    stats: { ...MERCHANT_STATS },
  };
}

export function readMerchantSession(): MerchantSession {
  if (typeof window === "undefined") return defaultSession();

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSession();
    const parsed = JSON.parse(raw) as MerchantSession;
    return {
      ...defaultSession(),
      ...parsed,
      profile: { ...MERCHANT_PROFILE, ...parsed.profile },
      customers: parsed.customers ?? DEMO_CUSTOMERS,
      approvals: parsed.approvals ?? DEMO_APPROVALS,
      usedCodes: parsed.usedCodes ?? [],
      stats: { ...MERCHANT_STATS, ...parsed.stats },
    };
  } catch {
    return defaultSession();
  }
}

export function writeMerchantSession(session: MerchantSession) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}
