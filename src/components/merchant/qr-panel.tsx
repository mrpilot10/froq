"use client";

import { useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { useMerchantQr } from "./use-merchant-qr";
import { MerchantPosterCard } from "./poster-card";

type QrView = "qr" | "poster";

const VIEWS: { value: QrView; label: string }[] = [
  { value: "qr", label: "QR code" },
  { value: "poster", label: "Poster" },
];

interface MerchantQrPanelProps {
  profile: MerchantProfile;
  product?: MerchantProduct;
}

export function MerchantQrPanel({
  profile,
  product = "loyalty",
}: MerchantQrPanelProps) {
  const [view, setView] = useState<QrView>("qr");
  const { qrUrl, joinUrl, download } = useMerchantQr(profile, product);
  const isQueue = product === "queue";

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">{isQueue ? "Queue QR" : "Loyalty QR"}</h3>
      <div className="panel-card merchant-qr-panel">
        {!isQueue && (
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
        )}

        {view === "qr" || isQueue ? (
          <>
            <p className="merchant-qr-caption">
              {isQueue
                ? `Display this at your entrance. Guests scan it to join ${profile.businessName}'s live waitlist.`
                : `Display this at your counter. Customers scan it to join ${profile.businessName}'s loyalty program.`}
            </p>

            <div className="merchant-qr-frame">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="merchant-qr-img"
                  src={qrUrl}
                  alt={isQueue ? "Queue join QR code" : "Loyalty join QR code"}
                  width={200}
                  height={200}
                />
              ) : (
                <div className="merchant-qr-skeleton" aria-hidden="true" />
              )}
            </div>

            <div className="merchant-qr-url">{joinUrl}</div>

            <div className="merchant-qr-actions">
              <a
                className="cta-btn merchant-view-page-btn merchant-qr-action"
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={17} strokeWidth={2.3} />
                View page
              </a>
              <button
                type="button"
                className="cta-btn merchant-cta-accent merchant-qr-download merchant-qr-action"
                onClick={download}
                disabled={!qrUrl}
              >
                <Download size={17} strokeWidth={2.3} />
                Download now
              </button>
            </div>
          </>
        ) : (
          <MerchantPosterCard caption="A ready-to-print poster with your loyalty QR placed on the Froq template." />
        )}
      </div>
    </div>
  );
}
