import type { ReactNode } from "react";
import { Globe, MapPin, Phone } from "lucide-react";

export interface BusinessContactInfo {
  phone?: string;
  address?: string;
  googleMapsUrl?: string;
  website?: string;
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

/** Phone / website / maps icons under the store name (loyalty + queue). */
export function BusinessContactRow({
  phone,
  address,
  googleMapsUrl,
  website,
}: BusinessContactInfo) {
  const phoneLink = phone?.trim() ? telHref(phone.trim()) : null;
  const site = website?.trim() || null;
  const mapLink = googleMapsUrl?.trim() || (address ? mapsHref(address) : null);

  const contactActions = [
    phoneLink
      ? {
          key: "phone",
          href: phoneLink,
          label: "Call store",
          icon: <Phone size={18} strokeWidth={2.1} />,
          external: false,
        }
      : null,
    site
      ? {
          key: "website",
          href: site,
          label: "Visit website",
          icon: <Globe size={18} strokeWidth={2.1} />,
          external: true,
        }
      : null,
    mapLink
      ? {
          key: "map",
          href: mapLink,
          label: "Open map",
          icon: <MapPin size={18} strokeWidth={2.1} />,
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

  if (contactActions.length === 0) return null;

  return (
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
  );
}
