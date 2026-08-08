import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  ChartColumnIncreasing,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Network,
  Radio,
  ScrollText,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
  Cloud,
  Database,
  Globe,
  Server,
  HeartPulse,
  Ticket,
  Stamp,
  CalendarCheck,
  Megaphone,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, page is polished but waiting on external APIs / instrumentation. */
  stub?: boolean;
};

export type AdminNavSection = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/revenue", label: "Revenue", icon: ChartColumnIncreasing },
      { href: "/admin/merchants", label: "Merchants", icon: Store },
      { href: "/admin/branches", label: "Branches", icon: Building2 },
      { href: "/admin/customers", label: "Customers", icon: Users },
    ],
  },
  {
    id: "products",
    label: "Products",
    items: [
      { href: "/admin/products", label: "Adoption", icon: Network },
      { href: "/admin/products/ai-menu", label: "AI Menu", icon: UtensilsCrossed },
      { href: "/admin/products/loyalty", label: "Loyalty", icon: Stamp },
      { href: "/admin/products/queue", label: "Queue", icon: Ticket },
      {
        href: "/admin/products/reservations",
        label: "Reservations",
        icon: CalendarCheck,
      },
      {
        href: "/admin/ai-analytics",
        label: "AI Analytics",
        icon: Sparkles,
      },
    ],
  },
  {
    id: "comms",
    label: "Communication",
    items: [
      {
        href: "/admin/communication",
        label: "Overview",
        icon: Radio,
      },
      {
        href: "/admin/communication/whatsapp",
        label: "WhatsApp",
        icon: MessageSquare,
      },
      {
        href: "/admin/communication/sms",
        label: "SMS",
        icon: Smartphone,
        stub: true,
      },
      {
        href: "/admin/communication/email",
        label: "Email",
        icon: Mail,
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    items: [
      {
        href: "/admin/marketing",
        label: "Overview",
        icon: Megaphone,
      },
    ],
  },
  {
    id: "money",
    label: "Money",
    items: [
      { href: "/admin/payments", label: "Payments", icon: CreditCard },
      {
        href: "/admin/platform-costs",
        label: "Platform Costs",
        icon: Wallet,
      },
    ],
  },
  {
    id: "infra",
    label: "Infrastructure",
    items: [
      {
        href: "/admin/infrastructure/google",
        label: "Google APIs",
        icon: Globe,
      },
      {
        href: "/admin/infrastructure/supabase",
        label: "Supabase",
        icon: Database,
      },
      {
        href: "/admin/infrastructure/vercel",
        label: "Vercel",
        icon: Server,
      },
      {
        href: "/admin/infrastructure/cloudflare",
        label: "Cloudflare",
        icon: Cloud,
      },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    items: [
      { href: "/admin/security", label: "Security", icon: Shield, stub: true },
      {
        href: "/admin/service-health",
        label: "Service Health",
        icon: HeartPulse,
        stub: true,
      },
      { href: "/admin/system-health", label: "System Health", icon: Gauge, stub: true },
      { href: "/admin/live-feed", label: "Live Feed", icon: Activity },
      {
        href: "/admin/audit-logs",
        label: "Audit Logs",
        icon: ScrollText,
        stub: true,
      },
      { href: "/admin/reports", label: "Reports", icon: FileText, stub: true },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function adminPageTitle(pathname: string): string {
  for (const section of ADMIN_NAV) {
    for (const item of section.items) {
      if (item.href === pathname) return item.label;
    }
  }
  if (pathname.startsWith("/admin/merchants/")) return "Merchant";
  return "Admin";
}
