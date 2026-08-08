import { redirect } from "next/navigation";

/** History moved to Customers — keep old bookmarks working. */
export default function MenuHistoryPage() {
  redirect("/merchant/menu/customers");
}
