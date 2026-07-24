import { redirect } from "next/navigation";

// Legacy entry. Customers use their permanent hub: /c/{publicToken}
// Shop QR still lands on /join/<slug>, then redirects to the hub after join.
export default function CardIndexPage() {
  redirect("/");
}
