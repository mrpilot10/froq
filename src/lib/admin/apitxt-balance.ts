import "server-only";

/**
 * API TXT account credit (SMS / WhatsApp / OTP). Read-only balance check.
 * https://apitxt.com/api/balance
 */

const BALANCE_URL = "https://apitxt.com/api/balance";
const CACHE_TTL_MS = 60_000;

/** Show a topbar notice when credit falls below this (INR/USD amount as returned). */
export const APITXT_LOW_BALANCE = 1000;

export type ApitxtBalance = {
  balance: number | null;
  currency: string;
  fetchedAt: string;
  error: string | null;
};

export function isApitxtBalanceLow(data: ApitxtBalance): boolean {
  return data.balance != null && data.balance < APITXT_LOW_BALANCE;
}

type CacheEntry = { at: number; value: ApitxtBalance };

declare global {
  // eslint-disable-next-line no-var
  var __froqApitxtBalanceCache: CacheEntry | undefined;
}

function empty(error: string | null): ApitxtBalance {
  return {
    balance: null,
    currency: "INR",
    fetchedAt: new Date().toISOString(),
    error,
  };
}

export async function getApitxtBalance(): Promise<ApitxtBalance> {
  const now = Date.now();
  const cached = globalThis.__froqApitxtBalanceCache;
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  const authkey = process.env.APITXT_AUTH_KEY?.trim();
  if (!authkey) {
    const value = empty("APITXT_AUTH_KEY not configured");
    globalThis.__froqApitxtBalanceCache = { at: now, value };
    return value;
  }

  try {
    const res = await fetch(BALANCE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        authkey,
      },
      body: new URLSearchParams({ authkey }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const value = empty(`API TXT ${res.status}`);
      globalThis.__froqApitxtBalanceCache = { at: now, value };
      return value;
    }

    const json = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { balance?: number; currency?: string };
    };

    if (json.status !== "success" || typeof json.data?.balance !== "number") {
      const value = empty(json.message || "Unexpected balance response");
      globalThis.__froqApitxtBalanceCache = { at: now, value };
      return value;
    }

    const value: ApitxtBalance = {
      balance: json.data.balance,
      currency: json.data.currency || "INR",
      fetchedAt: new Date().toISOString(),
      error: null,
    };
    globalThis.__froqApitxtBalanceCache = { at: now, value };
    return value;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Balance fetch failed";
    const value = empty(message);
    // Keep failed lookups short-lived so a blip recovers quickly.
    globalThis.__froqApitxtBalanceCache = { at: now - CACHE_TTL_MS + 15_000, value };
    return value;
  }
}

export function formatApitxtBalance(data: ApitxtBalance): string {
  if (data.balance == null) return "—";
  if (data.currency === "INR") {
    return `₹${data.balance.toLocaleString("en-IN", {
      minimumFractionDigits: data.balance % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `${data.balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${data.currency}`;
}
