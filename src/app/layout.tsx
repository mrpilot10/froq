import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Ga4SiteTag } from "@/components/analytics/ga4-site-tag";
import { AppToaster } from "@/components/app-toaster";
import { KeyboardAware } from "@/components/shared/keyboard-aware";
import { PwaBoot } from "@/components/shared/pwa-boot";
import { FROQ_LOGO_192_SRC, FROQ_LOGO_512_SRC, FROQ_LOGO_SRC } from "@/lib/brand";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Froq",
  description: "Digital loyalty for local businesses and their customers.",
  manifest: "/manifest.webmanifest",
  // Ensures iOS launches the home-screen app in standalone mode, which is
  // required for navigator.standalone and iOS 16.4+ web push to work.
  appleWebApp: {
    capable: true,
    title: "Froq",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: FROQ_LOGO_SRC, type: "image/png" },
      { url: FROQ_LOGO_192_SRC, sizes: "192x192", type: "image/png" },
      { url: FROQ_LOGO_512_SRC, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: FROQ_LOGO_192_SRC, sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#004353",
  // Shrink the layout viewport when the on-screen keyboard opens so fixed
  // elements (nav, CTAs) reposition above it and inputs stay reachable.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plusJakarta.variable} h-full`}>
      <body className="min-h-full antialiased">
        <Ga4SiteTag />
        <PwaBoot />
        {children}
        <KeyboardAware />
        <AppToaster />
        <SpeedInsights />
      </body>
    </html>
  );
}
