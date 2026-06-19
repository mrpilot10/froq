import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server's client assets (HMR, RSC payloads, JS chunks) to be
  // requested from other devices on the LAN (e.g. testing on a phone via the
  // machine's local IP). Without this, Next.js 16 blocks those cross-origin
  // requests and the page renders but never hydrates — so nothing is tappable.
  allowedDevOrigins: ["192.168.1.19"],
};

export default nextConfig;
