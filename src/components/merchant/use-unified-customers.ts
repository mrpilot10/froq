"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getUnifiedCustomers } from "@/app/merchant/actions";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import type { UnifiedCustomer } from "@/lib/merchant/unified-customers";
import { useRealtime } from "@/lib/supabase/use-realtime";

export type UnifiedCustomerProduct = "all" | "queue" | "reservation";

interface Snapshot {
  key: string;
  customers: UnifiedCustomer[];
  truncated: boolean;
  fetchedAtMs: number;
}

const POLL_MS = 12_000;
const REALTIME_DEBOUNCE_MS = 400;

function filterByProduct(
  customers: UnifiedCustomer[],
  product: UnifiedCustomerProduct,
): UnifiedCustomer[] {
  if (product === "queue") return customers.filter((row) => row.queue);
  if (product === "reservation") return customers.filter((row) => row.reservation);
  return customers;
}

/**
 * Live customer directory for Queue / Reservations / All Customers.
 * Refetches on branch change, realtime table events, visibility, and a light poll
 * so guests appear without a full page reload.
 */
export function useUnifiedCustomers(product: UnifiedCustomerProduct = "all") {
  const { profile, activeBranchId } = useMerchantWorkspace();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const requestKey = `${activeBranchId ?? "all"}:${product}`;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++inFlightRef.current;
    const branchId = activeBranchId;
    const key = `${branchId ?? "all"}:${product}`;
    try {
      const result = await getUnifiedCustomers({ branchId });
      // Drop stale responses when branch/product changed mid-flight.
      if (seq !== inFlightRef.current) return;
      setSnapshot({
        key,
        customers: filterByProduct(result.customers, product),
        truncated: result.truncated,
        fetchedAtMs: Date.now(),
      });
    } catch (error) {
      console.error("useUnifiedCustomers", error);
    }
  }, [activeBranchId, product]);

  const scheduleLoad = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void load();
    }, REALTIME_DEBOUNCE_MS);
  }, [load]);

  useEffect(() => {
    void load();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [load]);

  // Queue home polls; reservations use realtime. Customers need both so a
  // walk-in or public booking lands while this tab stays open.
  const merchantFilter = profile.id ? `merchant_id=eq.${profile.id}` : undefined;
  useRealtime("queue_entries", merchantFilter, scheduleLoad);
  useRealtime("reservations", merchantFilter, scheduleLoad);
  useRealtime("loyalty_cards", merchantFilter, scheduleLoad);
  useRealtime("approvals", merchantFilter, scheduleLoad);
  useRealtime("menu_dining_sessions", merchantFilter, scheduleLoad);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const fresh = snapshot?.key === requestKey ? snapshot : null;
  const loading = fresh === null;
  const customers = useMemo(() => fresh?.customers ?? [], [fresh]);

  return {
    customers,
    loading,
    truncated: fresh?.truncated ?? false,
    fetchedAtMs: fresh?.fetchedAtMs ?? Date.now(),
    refresh: load,
  };
}
