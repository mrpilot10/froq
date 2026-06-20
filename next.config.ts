import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's client assets (HMR, RSC payloads, JS chunks) to be
  // requested from other devices on the LAN (e.g. testing on a phone via the
  // machine's local IP). Without this, Next.js 16 blocks those cross-origin
  // requests and the page renders but never hydrates — so nothing is tappable.
  allowedDevOrigins: ["192.168.1.19"],
  experimental: {
    // Logos are downscaled client-side before upload, but keep a comfortable
    // ceiling so a server action carrying a logo data URL never hits the
    // default 1 MB limit (which surfaces as a generic server render error).
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
