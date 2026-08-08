import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { MENU_PREVIEW } from "@/lib/merchant/feature-flags";

/** AI Menu is unfinished: without the preview flag its URLs don't exist. */
export default function MerchantMenuLayout({ children }: { children: ReactNode }) {
  if (!MENU_PREVIEW) notFound();
  return <>{children}</>;
}
