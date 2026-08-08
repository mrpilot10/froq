import Link from "next/link";
import { ArrowRight, Sparkles, Stamp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SiteShell } from "./site-shell";

interface ProductCard {
  id: string;
  Icon: LucideIcon;
  name: string;
  tagline: string;
  description: string;
  points: string[];
  href: string;
}

const PRODUCT_CARDS: ProductCard[] = [
  {
    id: "loyalty",
    Icon: Stamp,
    name: "Loyalty Stamps",
    tagline: "Repeat-visit rewards",
    description:
      "Digital stamp cards your customers collect with a single scan at checkout — no app to download, no plastic cards to reprint.",
    points: ["QR enrollment in seconds", "Rewards that bring people back", "Customer insights built in"],
    href: "/loyalty-stamps",
  },
  {
    id: "queue",
    Icon: Users,
    name: "Smart Queue",
    tagline: "Live waitlists",
    description:
      "A live digital waitlist for your entrance. Guests join by scanning, wait wherever they like, and get a WhatsApp alert the moment their table is ready.",
    points: ["Self-serve join by QR", "WhatsApp ready-to-serve alerts", "Wait-time analytics"],
    href: "/queue-management",
  },
];

export function ProductPicker() {
  return (
    <SiteShell>
      <section className="lp-picker">
        <span className="lp-eyebrow">
          <Sparkles size={13} strokeWidth={2.4} />
          Two products, one dashboard
        </span>
        <h1 className="lp-picker-title">Everything your counter needs</h1>
        <p className="lp-picker-sub">
          Froq gives local businesses the tools to fill the room and keep people coming back.
          Pick the one you want to start with — they run side by side.
        </p>

        <div className="lp-picker-grid">
          {PRODUCT_CARDS.map(({ id, Icon, name, tagline, description, points, href }) => (
            <Link key={id} href={href} className="lp-product-card">
              <span className="lp-product-icon" aria-hidden="true">
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <span className="lp-product-tagline">{tagline}</span>
              <h2 className="lp-product-title">{name}</h2>
              <p className="lp-product-desc">{description}</p>
              <ul className="lp-product-points">
                {points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <span className="lp-product-cta">
                Explore {name}
                <ArrowRight size={16} strokeWidth={2.4} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
