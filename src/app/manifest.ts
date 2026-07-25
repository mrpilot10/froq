import type { MetadataRoute } from "next";
import { FROQ_LOGO_192_SRC, FROQ_LOGO_512_SRC } from "@/lib/brand";

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
      { src: FROQ_LOGO_192_SRC, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: FROQ_LOGO_512_SRC, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: FROQ_LOGO_512_SRC, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
