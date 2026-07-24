"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMerchantBundle, type MerchantBundle } from "@/app/merchant/actions";
import { createClient } from "@/lib/supabase/client";
import { readCheckoutAccount } from "@/lib/merchant/checkout";
import { MerchantExperience } from "./merchant-experience";
import { MerchantLogin } from "./merchant-login";
import { OnboardingWizard } from "./onboarding/onboarding-wizard";
import { MerchantGateSplash } from "./skeletons";

/** localStorage key for the merchant's currently selected branch (null = all). */
export const ACTIVE_BRANCH_KEY = "froq.activeBranch";

/**
 * Single source of truth for the merchant area, driven entirely by the Supabase
 * session + merchant row:
 *   - no session            → email/password login
 *   - session, not registered → email/password login (blocks loyalty customers)
 *   - session, checkout done  → setup wizard
 *   - session + store        → dashboard
 */
export function MerchantGate({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [bundle, setBundle] = useState<MerchantBundle | null>(null);
  const [clientReady, setClientReady] = useState(false);

  const refresh = useCallback(async () => {
    const branchId =
      typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_BRANCH_KEY) : null;
    const next = await getMerchantBundle(branchId);
    setBundle((prev) => {
      // A transient fetch error shouldn't tear down a working session. Keep the
      // last good bundle so the merchant stays on their dashboard; only surface
      // the error state when we have nothing to show yet.
      if (next.status === "error") return prev ?? next;
      return next;
    });
    // Keep localStorage aligned with what the server allowed (staff can't keep
    // a branch they aren't assigned to, or an "all branches" selection).
    if (typeof window !== "undefined" && next.status === "ready") {
      if (next.activeBranchId) {
        window.localStorage.setItem(ACTIVE_BRANCH_KEY, next.activeBranchId);
      } else if (next.canViewAllBranches) {
        window.localStorage.removeItem(ACTIVE_BRANCH_KEY);
      }
    }
  }, []);

  const handleSelectBranch = useCallback(
    async (branchId: string | null) => {
      if (typeof window !== "undefined") {
        if (branchId) window.localStorage.setItem(ACTIVE_BRANCH_KEY, branchId);
        else window.localStorage.removeItem(ACTIVE_BRANCH_KEY);
      }
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    setClientReady(true);
    void refresh();
  }, [refresh]);

  // Used only to prefill the wizard for merchants arriving from checkout.
  const checkoutAccount = clientReady ? readCheckoutAccount() : null;

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setBundle({ status: "unauthenticated" });
  }, [supabase]);

  if (!bundle) return <MerchantGateSplash />;

  if (bundle.status === "error") {
    return (
      <div className="merchant-page merchant-theme">
        <div className="merchant-screen merchant-gate-error">
          <p className="merchant-gate-error-title">Couldn&apos;t reach your dashboard</p>
          <p className="merchant-gate-error-sub">Check your connection and try again.</p>
          <button type="button" className="cta-btn merchant-cta-accent" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // "unauthenticated" = no session. "not_registered" = there IS a session, but it
  // doesn't belong to a merchant (e.g. a logged-in loyalty customer landing on
  // /merchant). In both cases show the merchant login rather than auto-entering
  // the dashboard, so a customer is never silently treated as a merchant. Their
  // existing customer session is left intact unless they log in here.
  if (bundle.status === "unauthenticated" || bundle.status === "not_registered") {
    return <MerchantLogin onAuthed={refresh} />;
  }

  // Paid via checkout — global setup + first product for new merchants.
  if (bundle.status === "needs_setup") {
    return (
      <OnboardingWizard
        mode="full"
        product={bundle.product}
        checkoutAccount={checkoutAccount}
        onComplete={refresh}
      />
    );
  }

  return (
    <MerchantExperience
      profile={bundle.profile}
      dashboardStats={bundle.dashboardStats}
      customers={bundle.customers}
      approvals={bundle.approvals}
      entitlements={bundle.entitlements}
      branches={bundle.branches}
      members={bundle.members}
      role={bundle.role}
      activeBranchId={bundle.activeBranchId}
      canViewAllBranches={bundle.canViewAllBranches}
      justJoined={bundle.justJoined}
      onSelectBranch={handleSelectBranch}
      onRefresh={refresh}
      onLogout={handleLogout}
    >
      {children}
    </MerchantExperience>
  );
}
