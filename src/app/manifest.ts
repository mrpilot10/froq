import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Froq Merchant",
    short_name: "Froq",
    description: "Manage your loyalty program, approvals, and customer LTV with Froq.",
    start_url: "/merchant",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#004353",
    icons: [
      { src: "/froq-logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/froq-logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
