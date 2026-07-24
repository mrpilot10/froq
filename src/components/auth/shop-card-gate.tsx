"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomerAccount, getCustomerHome, type CustomerHome } from "@/app/actions/customer";
import { customerHubPath } from "@/lib/customer/hub";
import { createClient } from "@/lib/supabase/client";
import { LoyaltyExperience } from "@/components/loyalty/loyalty-experience";

interface ShopCardGateProps {
  slug: string;
}

/**
 * Legacy /card/{slug} entry. Prefer /c/{publicToken}.
 * When ready, redirects to the permanent hub URL.
 */
export function ShopCardGate({ slug }: ShopCardGateProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [home, setHome] = useState<CustomerHome | null>(null);

  const refresh = useCallback(async () => {
    setHome(await getCustomerHome(slug));
  }, [slug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!home) return;
    if (home.status === "unauthenticated" || home.status === "no_membership") {
      router.replace(`/join/${slug}`);
      return;
    }
    if (home.status === "ready" && home.publicToken) {
      router.replace(customerHubPath(home.publicToken));
    }
  }, [home, slug, router]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace(`/join/${slug}`);
  }, [supabase, slug, router]);

  const handleDeleteAccount = useCallback(async () => {
    if (home?.status !== "ready") return { ok: false, error: "Account not loaded." };
    const res = await deleteCustomerAccount(home.card.customerId);
    if (res.ok) {
      await supabase.auth.signOut();
      router.replace(`/join/${slug}`);
    }
    return res;
  }, [home, supabase, slug, router]);

  // Prefer hub redirect; briefly render loyalty only if token missing (shouldn't happen post-migration).
  if (!home || home.status !== "ready") {
    return null;
  }

  if (home.publicToken) {
    return null;
  }

  return (
    <LoyaltyExperience
      business={home.business}
      card={home.card}
      history={home.history}
      rewardCards={home.rewardCards}
      totalStampsCollected={home.totalStampsCollected}
      memberSince={home.memberSince}
      customerName={home.customerName}
      customerPhone={home.customerPhone}
      customerEmail={home.customerEmail}
      onRefresh={refresh}
      onLogout={handleLogout}
      onDeleteAccount={handleDeleteAccount}
    />
  );
}
