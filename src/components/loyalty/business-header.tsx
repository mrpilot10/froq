import type { BusinessInfo } from "@/lib/loyalty/types";
import { CoffeeIcon } from "./icons";

interface BusinessHeaderProps {
  business: BusinessInfo;
}

export function BusinessHeader({ business }: BusinessHeaderProps) {
  return (
    <div className="header">
      <div className="logo-wrap">
        <CoffeeIcon />
      </div>
      <div className="biz-details">
        <h1 className="biz-name">{business.name}</h1>
        <p className="biz-address">{business.address}</p>
      </div>
    </div>
  );
}
