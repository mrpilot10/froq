import type { ReactNode } from "react";
import { SiteShell } from "@/components/landing/site-shell";

/** Marketing chrome for everything under /help, docs and ticket alike. */
export default function HelpLayout({ children }: { children: ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
