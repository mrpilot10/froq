import Image from "next/image";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { CoffeeIcon } from "./icons";
import { BusinessContactRow } from "./business-contact-row";

interface BusinessHeaderProps {
  business: BusinessInfo;
}

export function BusinessHeader({ business }: BusinessHeaderProps) {
  return (
    <div className="header">
      <div className="logo-wrap">
        {business.logoUrl ? (
          <Image
            src={business.logoUrl}
            alt={business.name}
            width={88}
            height={88}
            unoptimized
            className="biz-logo-img"
          />
        ) : (
          <CoffeeIcon />
        )}
      </div>
      <div className="biz-details">
        <h1 className="biz-name">{business.name}</h1>
        <BusinessContactRow
          phone={business.phone}
          address={business.address}
          googleMapsUrl={business.googleMapsUrl}
          website={business.socialLinks.website}
        />
      </div>
    </div>
  );
}
