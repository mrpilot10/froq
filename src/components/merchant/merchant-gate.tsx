"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMerchantBundle, type MerchantBundle } from "@/app/merchant/actions";
import { createClient } from "@/lib/supabase/client";
import {
  isCheckoutMerchant,
  readSetupDone,
  writeSetupDone,
} from "@/lib/merchant/auth";
import { readCheckoutAccount } from "@/lib/merchant/checkout";
import { MerchantExperience } from "./merchant-experience";
import { MerchantLocalExperience } from "./merchant-local-experience";
import { MerchantLogin } from "./merchant-login";
import { MerchantSetupWizard } from "./merchant-setup-wizard";
import { MerchantLoadingScreen } from "./skeletons";

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

  const checkoutAccount = clientReady ? readCheckoutAccount() : null;
  const paidCheckout = clientReady && isCheckoutMerchant();
  const setupDone = clientReady && readSetupDone();

  const handleSetupComplete = useCallback(async () => {
    writeSetupDone(true);
    await refresh();
  }, [refresh]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setBundle({ status: "unauthenticated" });
  }, [supabase]);

  // Paid via checkout but store not configured yet → setup wizard.
  if (paidCheckout && !setupDone) {
    return (
      <MerchantSetupWizard
        checkoutAccount={checkoutAccount}
        onComplete={handleSetupComplete}
      />
    );
  }

  if (!bundle) return <MerchantLoadingScreen />;

  // Checkout merchant with setup done, no Supabase session → local demo dashboard.
  if (paidCheckout && setupDone && bundle.status === "unauthenticated") {
    return <MerchantLocalExperience onLogout={() => void refresh()} />;
  }

  if (bundle.status === "unauthenticated") return <MerchantLogin onAuthed={refresh} />;
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
