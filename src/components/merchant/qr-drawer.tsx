"use client";

import { Download } from "lucide-react";
import type { MerchantProfile } from "@/lib/merchant/types";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { useMerchantQr } from "./use-merchant-qr";

interface MerchantQrDrawerProps {
  open: boolean;
  profile: MerchantProfile;
  onClose: () => void;
}

export function MerchantQrDrawer({ open, profile, onClose }: MerchantQrDrawerProps) {
  const { qrUrl, joinUrl, download } = useMerchantQr(profile);

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="merchant-qr-title" className="merchant-theme">
      <div className="merchant-qr-drawer">
        <div className="merchant-qr-drawer-head">
          <h3 id="merchant-qr-title" className="merchant-qr-drawer-title">
            Scan to join
          </h3>
          <p className="merchant-qr-drawer-sub">
            Customers scan this code to join {profile.businessName}&apos;s loyalty card.
          </p>
        </div>

        <div className="merchant-qr-frame merchant-qr-frame--lg">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="merchant-qr-img" src={qrUrl} alt="Loyalty join QR code" width={260} height={260} />
          ) : (
            <div className="merchant-qr-skeleton" aria-hidden="true" />
          )}
        </div>

        <div className="merchant-qr-url">{joinUrl}</div>

        <button
          type="button"
          className="cta-btn merchant-cta-accent merchant-qr-download"
          onClick={download}
          disabled={!qrUrl}
        >
          <Download size={17} strokeWidth={2.3} />
          Download QR
        </button>
      </div>
    </BottomSheet>
  );
}
