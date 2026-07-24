import Image from "next/image";
import { MapPin } from "lucide-react";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { CoffeeIcon } from "./icons";

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
        {business.address && (
          <p className="biz-address">
            <MapPin size={13} strokeWidth={2.2} className="biz-address-icon" />
            {business.address}
          </p>
        )}
      </div>
    </div>
  );
}
