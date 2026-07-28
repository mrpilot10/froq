"use client";

import { ManagePlanScreen } from "@/components/merchant/manage-plan-screen";

/** Reservations product pricing table; returns to Reservation settings. */
export default function ReservationPlanPage() {
  return (
    <ManagePlanScreen product="reservation" backHref="/merchant/reservations/settings" />
  );
}
