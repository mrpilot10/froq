import { redirect } from "next/navigation";

/** Offers tab replaced by Customers — keep old bookmarks working. */
export default function MenuOffersPage() {
  redirect("/merchant/menu/customers");
}
