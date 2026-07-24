"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomerAccount, getCustomerHub, type CustomerHome } from "@/app/actions/customer";
import { customerHubPath } from "@/lib/customer/hub";
import { createClient } from "@/lib/supabase/client";
import { LoyaltyExperience } from "@/components/loyalty/loyalty-experience";

interface CustomerHubGateProps {
  token: string;
}

/**
 * Customer × Business hub at /c/{publicToken}.
 * Conditionally renders loyalty (and later waitlist / reservations) from one token.
 */
export function CustomerHubGate({ token }: CustomerHubGateProps) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [home, setHome] = useState<CustomerHome | null>(null);

  const refresh = useCallback(async () => {
    setHome(await getCustomerHub(token));
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!home) return;

    if (home.status === "not_found") {
      router.replace("/");
      return;
    }

    if (home.status === "unauthenticated" || home.status === "no_membership") {
      const next =
        home.status === "unauthenticated" && home.publicToken
          ? `?next=${encodeURIComponent(customerHubPath(home.publicToken))}`
          : "";
      router.replace(`/join/${home.slug}${next}`);
      return;
    }

    if (home.status === "forbidden") {
      router.replace(`/join/${home.slug}`);
      return;
    }

    // Legacy /c/{slug} → permanent /c/{publicToken}
    if (
      home.status === "ready" &&
      home.publicToken &&
      token.trim() !== home.publicToken &&
      !token.trim().toLowerCase().startsWith("frq_")
    ) {
      router.replace(customerHubPath(home.publicToken));
    }
  }, [home, token, router]);

  const handleLogout = useCallback(async () => {
    if (home && "slug" in home && home.slug) {
      await supabase.auth.signOut();
      router.replace(`/join/${home.slug}`);
      return;
    }
    await supabase.auth.signOut();
    router.replace("/");
  }, [supabase, home, router]);

  const handleDeleteAccount = useCallback(async () => {
    if (home?.status !== "ready") return { ok: false, error: "Account not loaded." };
    const res = await deleteCustomerAccount(home.card.customerId);
    if (res.ok) {
      await supabase.auth.signOut();
      router.replace(`/join/${home.slug}`);
    }
    return res;
  }, [home, supabase, router]);

  if (!home || home.status !== "ready") {
    return null;
  }

  // Hub composition: only modules that apply for this customer right now.
  // Loyalty is the first module; waiting list / reservations hook in here later.
  const showLoyalty = home.modules.loyalty;

  if (!showLoyalty && !home.modules.waitingList && !home.modules.reservation) {
    return (
      <div className="loyalty-page">
        <div className="loyalty-screen" style={{ padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{home.business.name}</h1>
          <p style={{ opacity: 0.7 }}>Nothing to show yet. Check back soon.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {showLoyalty ? (
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
      ) : null}
      {/* Future: WaitingListModule / ReservationModule when modules.*.true */}
    </>
  );
}
