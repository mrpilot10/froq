import type { Metadata } from "next";
import { MenuLandingPage } from "@/components/landing/menu-landing-page";

export const metadata: Metadata = {
  title: "AI Digital Menu — Froq",
  description:
    "Your menu, now ready to talk. Not a PDF — an AI-powered digital menu guests can ask questions to, in English, Hindi, Marathi, Tamil, and more.",
};

export default function AiDigitalMenuPage() {
  return <MenuLandingPage />;
}
