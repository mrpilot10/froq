import type { Metadata } from "next";
import { QueueLandingPage } from "@/components/landing/queue-landing-page";

export const metadata: Metadata = {
  title: "Smart Queue — Froq",
  description:
    "A live digital waitlist for your entrance. Guests join by scanning a QR code and get a WhatsApp alert when their table is ready.",
};

export default function QueueManagementPage() {
  return <QueueLandingPage />;
}
