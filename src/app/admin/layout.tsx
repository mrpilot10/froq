import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Froq Super Admin",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
