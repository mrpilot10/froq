import type { BusinessInfo } from "@/lib/loyalty/types";
import {
  FacebookIcon,
  GoogleIcon,
  InstagramIcon,
  WhatsAppIcon,
} from "./icons";

interface SocialRowProps {
  links: BusinessInfo["socialLinks"];
  className?: string;
}

/** Social / review links only — website lives under the cafe name as a contact action. */
export function SocialRow({ links, className = "social-row" }: SocialRowProps) {
  const items = [
    { key: "instagram", href: links.instagram, icon: <InstagramIcon />, label: "Instagram" },
    { key: "whatsapp", href: links.whatsapp, icon: <WhatsAppIcon />, label: "WhatsApp" },
    { key: "facebook", href: links.facebook, icon: <FacebookIcon />, label: "Facebook" },
    { key: "googleReviews", href: links.googleReviews, icon: <GoogleIcon />, label: "Google reviews" },
  ].filter((item) => item.href);

  if (items.length === 0) return null;

  return (
    <div className={className}>
      {items.map((item) => (
        <a
          key={item.key}
          className="social-btn"
          href={item.href}
          aria-label={item.label}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}

interface FollowUsProps {
  links: BusinessInfo["socialLinks"];
}

export function FollowUs({ links }: FollowUsProps) {
  const hasAny =
    Boolean(links.instagram) ||
    Boolean(links.whatsapp) ||
    Boolean(links.facebook) ||
    Boolean(links.googleReviews);
  if (!hasAny) return null;

  return (
    <div className="follow-us">
      <p className="follow-us-label">Follow Us</p>
      <SocialRow links={links} className="social-row follow-us-icons" />
    </div>
  );
}
