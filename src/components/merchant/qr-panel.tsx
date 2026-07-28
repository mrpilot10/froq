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

const QR_COPY: Record<MerchantProduct, { title: string; caption: (name: string) => string; alt: string }> = {
  loyalty: {
    title: "Loyalty QR",
    caption: (name) =>
      `Display this at your counter. Customers scan it to join ${name}'s loyalty program.`,
    alt: "Loyalty join QR code",
  },
  queue: {
    title: "Queue QR",
    caption: (name) =>
      `Display this at your entrance. Guests scan it to join ${name}'s live waitlist.`,
    alt: "Queue join QR code",
  },
  reservation: {
    title: "Reservation QR",
    caption: (name) =>
      `Display this at your entrance or share the link. Guests scan it to request a table at ${name}.`,
    alt: "Reservation request QR code",
  },
};

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
  const copy = QR_COPY[product];
  // The printable poster template only exists for loyalty.
  const posterAvailable = product === "loyalty";

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">{copy.title}</h3>
      <div className="panel-card merchant-qr-panel">
        {posterAvailable && (
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

        {view === "qr" || !posterAvailable ? (
          <>
            <p className="merchant-qr-caption">{copy.caption(profile.businessName)}</p>

            <div className="merchant-qr-frame">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="merchant-qr-img"
                  src={qrUrl}
                  alt={copy.alt}
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
