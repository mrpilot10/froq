"use client";

import { useRouter } from "next/navigation";
import { ReservationSettingsScreen } from "@/components/merchant/reservations/reservation-settings-screen";
import { useMerchantWorkspace } from "@/components/merchant/merchant-workspace-context";
import { isProductEnabled } from "@/lib/merchant/entitlements";

export default function ReservationSettingsPage() {
  const router = useRouter();
  const { profile, role, entitlements, onSaveReservationSettings, onPurchaseProduct } =
    useMerchantWorkspace();
  const isOwner = role === "owner";
  return (
    <ReservationSettingsScreen
      profile={profile}
      onSave={onSaveReservationSettings}
      productEnabled={isProductEnabled(entitlements, "reservation")}
      onGetStarted={isOwner ? () => onPurchaseProduct("reservation") : undefined}
      onManagePlan={isOwner ? () => router.push("/merchant/reservations/plan") : undefined}
    />
  );
}
