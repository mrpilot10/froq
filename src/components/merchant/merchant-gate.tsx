"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMerchantBundle, type MerchantBundle } from "@/app/merchant/actions";
import { createClient } from "@/lib/supabase/client";
import { MerchantExperience } from "./merchant-experience";
import { MerchantLogin } from "./merchant-login";
import { MerchantSetupWizard } from "./merchant-setup-wizard";
import { MerchantLoadingScreen } from "./skeletons";

export function MerchantGate() {
  const supabase = useMemo(() => createClient(), []);
  const [bundle, setBundle] = useState<MerchantBundle | null>(null);

  const refresh = useCallback(async () => {
    const next = await getMerchantBundle();
    setBundle(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setBundle({ status: "unauthenticated" });
  }, [supabase]);

  if (!bundle) return <MerchantLoadingScreen />;
  if (bundle.status === "unauthenticated") return <MerchantLogin onAuthed={refresh} />;
  if (bundle.status === "needs_setup") return <MerchantSetupWizard onComplete={refresh} />;

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
