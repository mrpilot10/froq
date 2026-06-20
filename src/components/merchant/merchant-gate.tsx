"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMerchantBundle, type MerchantBundle } from "@/app/merchant/actions";
import { createClient } from "@/lib/supabase/client";
import { readCheckoutAccount } from "@/lib/merchant/checkout";
import { MerchantExperience } from "./merchant-experience";
import { MerchantLogin } from "./merchant-login";
import { MerchantSetupWizard } from "./merchant-setup-wizard";
import { MerchantLoadingScreen } from "./skeletons";

/**
 * Single source of truth for the merchant area, driven entirely by the Supabase
 * session + merchant row:
 *   - no session            → OTP login
 *   - session, no store yet  → setup wizard (new merchants only)
 *   - session + store        → dashboard
 */
export function MerchantGate() {
  const supabase = useMemo(() => createClient(), []);
  const [bundle, setBundle] = useState<MerchantBundle | null>(null);
  const [clientReady, setClientReady] = useState(false);

  const refresh = useCallback(async () => {
    setBundle(await getMerchantBundle());
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

  if (!bundle) return <MerchantLoadingScreen />;

  if (bundle.status === "unauthenticated") return <MerchantLogin onAuthed={refresh} />;

  // New merchant (or one who hasn't built a store yet) → store builder.
  if (bundle.status === "needs_setup") {
    return <MerchantSetupWizard checkoutAccount={checkoutAccount} onComplete={refresh} />;
  }

  return (
    <MerchantExperience
      profile={bundle.profile}
      stats={bundle.stats}
      customers={bundle.customers}
      approvals={bundle.approvals}
      onRefresh={refresh}
      onLogout={handleLogout}
    />
  );
}
