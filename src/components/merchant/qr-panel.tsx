"use client";

import { Download } from "lucide-react";
import type { MerchantProfile } from "@/lib/merchant/types";
import { useMerchantQr } from "./use-merchant-qr";

export function MerchantQrPanel({ profile }: { profile: MerchantProfile }) {
  const { qrUrl, joinUrl, download } = useMerchantQr(profile);

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">Loyalty QR</h3>
      <div className="panel-card merchant-qr-panel">
        <p className="merchant-qr-caption">
          Display this at your counter. Customers scan it to join {profile.businessName}&apos;s
          loyalty program.
        </p>

        <div className="merchant-qr-frame">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="merchant-qr-img" src={qrUrl} alt="Loyalty join QR code" width={200} height={200} />
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
          Download now
        </button>
      </div>
    </div>
  );
}
