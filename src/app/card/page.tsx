import { redirect } from "next/navigation";

// Customers access their card per shop via QR: /join/<slug> → /card/<slug>
export default function CardIndexPage() {
  redirect("/");
}
