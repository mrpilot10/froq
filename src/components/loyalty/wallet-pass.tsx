import Image from "next/image";
import type { BusinessInfo } from "@/lib/loyalty/types";
import { CoffeeIcon } from "./icons";
import { StampGrid, StampProgressLabel } from "./stamp-grid";

interface WalletPassProps {
  business: BusinessInfo;
  filled: number;
  pending?: boolean;
  customerName?: string;
  customerInitials?: string;
  onRewardClick?: () => void;
}

export function WalletPass({
  business,
  filled,
  pending = false,
  customerName = "Alex Morgan",
  customerInitials = "AM",
  onRewardClick,
}: WalletPassProps) {
  return (
    <div className="pass-stack">
      <div className="pass-shadow-card s2" />
      <div className="pass-shadow-card s1" />

      <div className="pass">
        <div className="pass-top">
          <div className="pass-brand">
            <div className="pass-brand-mark">
              {business.logoUrl ? (
                <Image
                  src={business.logoUrl}
                  alt={business.name}
                  width={32}
                  height={32}
                  unoptimized
                  className="pass-brand-logo-img"
                />
              ) : (
                <CoffeeIcon stroke="#fff" />
              )}
            </div>
            <div className="pass-brand-name">{business.name}</div>
          </div>
        </div>

        <div className="pass-headline">
          <div className="pass-headline-text">
            <h2 className="pass-title">{business.rewardTitle}</h2>
            <p className="pass-subtitle">{business.rewardSubtitle}</p>
          </div>

          <div className="pass-thumb">
            <Image
              src={business.rewardImage}
              alt={business.rewardName}
              fill
              sizes="76px"
              className="pass-thumb-img"
            />
          </div>
        </div>

        <StampGrid
          total={business.totalStamps}
          filled={filled}
          pending={pending}
          onRewardClick={onRewardClick}
        />

        <div className="pass-divider" />

        <div className="pass-bottom">
          <div>
            <div className="pass-bottom-label">Progress</div>
            <StampProgressLabel
              filled={filled}
              total={business.totalStamps}
              pending={pending}
            />
          </div>
          <div className="pass-bottom-r">
            <div className="pass-reward-caption">
              <div className="pass-customer-name">{customerName}</div>
            </div>
            <div className="pass-avatar">{customerInitials}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
