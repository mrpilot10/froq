import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { KeyboardAware } from "@/components/shared/keyboard-aware";
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
      { url: "/froq-logo.png", type: "image/png" },
      { url: "/froq-logo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/froq-logo-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/froq-logo-192.png", sizes: "192x192", type: "image/png" }],
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
      <head>
        {/*
          Capture beforeinstallprompt as early as possible. On Android Chrome this
          event often fires before React mounts its listeners, so without this the
          native install prompt is lost and we fall back to manual steps.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__froqInstallPrompt = null;
              window.addEventListener('beforeinstallprompt', function (e) {
                e.preventDefault();
                window.__froqInstallPrompt = e;
                window.dispatchEvent(new Event('froq:installprompt'));
              });
              window.addEventListener('appinstalled', function () {
                window.__froqInstallPrompt = null;
              });
              // Register the service worker on load so Android treats the app as
              // installable (otherwise beforeinstallprompt never fires).
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-full antialiased">
        {children}
        <KeyboardAware />
        <Toaster
          position="bottom-center"
          toastOptions={{ className: "froq-toast" }}
        />
        <SpeedInsights />
      </body>
    </html>
  );
}
