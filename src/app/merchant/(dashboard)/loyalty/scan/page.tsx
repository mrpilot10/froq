import { redirect } from "next/navigation";

/** Scan moved to a Home quick-action bottom sheet. */
export default function LoyaltyScanPage() {
  redirect("/merchant/loyalty");
}
