import type { HistoryEntry } from "@/lib/loyalty/types";
import { DEMO_HISTORY, INITIAL_FILLED } from "./constants";

const LOYALTY_STORAGE_KEY = "froq-loyalty";

export interface LoyaltySession {
  filled: number;
  history: HistoryEntry[];
  isRedeemed: boolean;
  memberSince: string;
}

function defaultSession(): LoyaltySession {
  return {
    filled: INITIAL_FILLED,
    history: DEMO_HISTORY,
    isRedeemed: false,
    memberSince: "Jun 2026",
  };
}

export function readLoyaltySession(): LoyaltySession {
  if (typeof window === "undefined") return defaultSession();

  try {
    const raw = window.sessionStorage.getItem(LOYALTY_STORAGE_KEY);
    if (!raw) return defaultSession();
    return { ...defaultSession(), ...JSON.parse(raw) } as LoyaltySession;
  } catch {
    return defaultSession();
  }
}

export function writeLoyaltySession(session: LoyaltySession) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOYALTY_STORAGE_KEY, JSON.stringify(session));
}

export function clearLoyaltySession() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LOYALTY_STORAGE_KEY);
}
