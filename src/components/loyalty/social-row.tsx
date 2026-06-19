import type { BusinessInfo } from "@/lib/loyalty/types";
import {
  FacebookIcon,
  GoogleIcon,
  InstagramIcon,
  WebsiteIcon,
  WhatsAppIcon,
} from "./icons";

interface SocialRowProps {
  links: BusinessInfo["socialLinks"];
  className?: string;
}

export function SocialRow({ links, className = "social-row" }: SocialRowProps) {
  const items = [
    { key: "instagram", href: links.instagram, icon: <InstagramIcon />, label: "Instagram" },
    { key: "whatsapp", href: links.whatsapp, icon: <WhatsAppIcon />, label: "WhatsApp" },
    { key: "facebook", href: links.facebook, icon: <FacebookIcon />, label: "Facebook" },
    { key: "website", href: links.website, icon: <WebsiteIcon />, label: "Website" },
    { key: "googleReviews", href: links.googleReviews, icon: <GoogleIcon />, label: "Google reviews" },
  ].filter((item) => item.href);

  return (
    <div className={className}>
      {items.map((item) => (
        <a
          key={item.key}
          className="social-btn"
          href={item.href}
          aria-label={item.label}
          target={item.href?.startsWith("http") ? "_blank" : undefined}
          rel={item.href?.startsWith("http") ? "noopener noreferrer" : undefined}
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}
