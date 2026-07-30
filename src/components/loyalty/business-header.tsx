import Image from "next/image";
import type { ReactNode } from "react";
import { Globe, MapPin, Phone } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { CoffeeIcon } from "./icons";

interface BusinessHeaderProps {
  business: BusinessInfo;
}

function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  if (!digits || digits.replace(/\D/g, "").length < 7) return null;
  return `tel:${digits}`;
}

function mapsHref(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
}

export function BusinessHeader({ business }: BusinessHeaderProps) {
  const phoneLink = business.phone?.trim() ? telHref(business.phone.trim()) : null;
  const website = business.socialLinks.website?.trim() || null;
  const mapLink =
    business.googleMapsUrl?.trim() || mapsHref(business.address);

  const contactActions = [
    phoneLink
      ? {
          key: "phone",
          href: phoneLink,
          label: "Call store",
          icon: <Phone size={14} strokeWidth={1.7} />,
          external: false,
        }
      : null,
    website
      ? {
          key: "website",
          href: website,
          label: "Visit website",
          icon: <Globe size={14} strokeWidth={1.7} />,
          external: true,
        }
      : null,
    mapLink
      ? {
          key: "map",
          href: mapLink,
          label: "Open map",
          icon: <MapPin size={14} strokeWidth={1.7} />,
          external: true,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    href: string;
    label: string;
    icon: ReactNode;
    external: boolean;
  }>;

  return (
    <div className="header">
      <div className="logo-wrap">
        {business.logoUrl ? (
          <Image
            src={business.logoUrl}
            alt={business.name}
            width={56}
            height={56}
            unoptimized
            className="biz-logo-img"
          />
        ) : (
          <CoffeeIcon />
        )}
      </div>
      <div className="biz-details">
        <h1 className="biz-name">{business.name}</h1>
        {contactActions.length > 0 ? (
          <div className="biz-contact-row" aria-label="Store contact">
            {contactActions.map((action) => (
              <a
                key={action.key}
                className="biz-contact-btn"
                href={action.href}
                aria-label={action.label}
                {...(action.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {action.icon}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
