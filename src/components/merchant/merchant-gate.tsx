"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMerchantBundle, type MerchantBundle } from "@/app/merchant/actions";
import { createClient } from "@/lib/supabase/client";
import { readCheckoutAccount } from "@/lib/merchant/checkout";
import { MerchantExperience } from "./merchant-experience";
import { MerchantLogin } from "./merchant-login";
import { MerchantSetupWizard } from "./merchant-setup-wizard";
import { MerchantGateSplash } from "./skeletons";

/**
 * Single source of truth for the merchant area, driven entirely by the Supabase
 * session + merchant row:
 *   - no session            → email/password login
 *   - session, not registered → email/password login (blocks loyalty customers)
 *   - session, checkout done  → setup wizard
 *   - session + store        → dashboard
 */
export function MerchantGate() {
  const supabase = useMemo(() => createClient(), []);
  const [bundle, setBundle] = useState<MerchantBundle | null>(null);
  const [clientReady, setClientReady] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getMerchantBundle();
    setBundle((prev) => {
      // A transient fetch error shouldn't tear down a working session. Keep the
      // last good bundle so the merchant stays on their dashboard; only surface
      // the error state when we have nothing to show yet.
      if (next.status === "error") return prev ?? next;
      return next;
    });
  }, []);

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

  // Paid via checkout — store builder for new merchants.
  if (bundle.status === "needs_setup") {
    return <MerchantSetupWizard checkoutAccount={checkoutAccount} onComplete={refresh} />;
  }

  return (
    <MerchantExperience
      profile={bundle.profile}
      dashboardStats={bundle.dashboardStats}
      customers={bundle.customers}
      approvals={bundle.approvals}
      onRefresh={refresh}
      onLogout={handleLogout}
    />
  );
}
