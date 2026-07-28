import type { Metadata } from "next";
import { getPublicReservation, resolveReservationPage } from "@/app/r/actions";
import { ReservationRequestScreen } from "@/components/reservations/reservation-request-screen";
import { ReservationStatusScreen } from "@/components/reservations/reservation-status-screen";
import { FroqFooter } from "@/components/shared/froq-footer";
import { isReservationPublicToken } from "@/lib/reservations/link";

export const metadata: Metadata = {
  title: "Your reservation — Froq",
  description:
    "Request a table and track your reservation — confirmations, new times and reminders all in one place.",
};

function NotFoundCard({ message }: { message: string }) {
  return (
    <div className="loyalty-page">
      <div className="loyalty-screen auth-screen">
        <div className="auth-card">
          <div className="auth-head">
            <h2 className="auth-title">Reservation not found</h2>
            <p className="auth-sub">{message}</p>
          </div>
        </div>
        <FroqFooter />
      </div>
    </div>
  );
}

/**
 * One public route, two jobs:
 *   /r/{merchantSlug}  → request a table
 *   /r/{rsv_…}         → that booking's own page (the WhatsApp CTA target)
 * Reservation tokens are prefixed, so they can never collide with a slug.
 */
export default async function ReservationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (isReservationPublicToken(slug)) {
    const result = await getPublicReservation(slug);
    if (!result.ok || !result.reservation) {
      return (
        <NotFoundCard message="This reservation link is invalid or has been removed." />
      );
    }
    return <ReservationStatusScreen reservation={result.reservation} />;
  }

  const resolved = await resolveReservationPage(slug);
  if (!resolved.ok) {
    return <NotFoundCard message="This reservation link is invalid or has been removed." />;
  }

  return <ReservationRequestScreen merchant={resolved.merchant} />;
}
