"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCustomerHome, type CustomerHome } from "@/app/actions/customer";
import { createClient } from "@/lib/supabase/client";
import { CardSkeleton } from "@/components/loyalty/card-skeleton";
import { LoyaltyExperience } from "@/components/loyalty/loyalty-experience";

interface ShopCardGateProps {
  slug: string;
  brandColor?: string;
}

export function ShopCardGate({ slug, brandColor }: ShopCardGateProps) {
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
    }
  }, [home, slug, router]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace(`/join/${slug}`);
  }, [supabase, slug, router]);

  if (!home || home.status !== "ready") {
    return <CardSkeleton brandColor={brandColor} />;
  }

  return (
    <LoyaltyExperience
      business={home.business}
      card={home.card}
      history={home.history}
      memberSince={home.memberSince}
      customerName={home.customerName}
      customerPhone={home.customerPhone}
      customerEmail={home.customerEmail}
      onRefresh={refresh}
      onLogout={handleLogout}
    />
  );
}
