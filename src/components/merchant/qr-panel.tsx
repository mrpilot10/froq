"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { MerchantProfile } from "@/lib/merchant/types";
import { useMerchantQr } from "./use-merchant-qr";
import { MerchantPosterCard } from "./poster-card";

type QrView = "qr" | "poster";

const VIEWS: { value: QrView; label: string }[] = [
  { value: "qr", label: "QR code" },
  { value: "poster", label: "Poster" },
];

export function MerchantQrPanel({ profile }: { profile: MerchantProfile }) {
  const [view, setView] = useState<QrView>("qr");
  const { qrUrl, joinUrl, download } = useMerchantQr(profile);

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">Loyalty QR</h3>
      <div className="panel-card merchant-qr-panel">
        <div className="merchant-qr-tabs" role="tablist" aria-label="QR download options">
          {VIEWS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={view === item.value}
              className={`merchant-qr-tab${view === item.value ? " merchant-qr-tab--active" : ""}`}
              onClick={() => setView(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {view === "qr" ? (
          <>
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
          </>
        ) : (
          <MerchantPosterCard caption="A ready-to-print poster with your loyalty QR placed on the Froq template." />
        )}
      </div>
    </div>
  );
}
