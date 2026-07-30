"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { useMerchantQr } from "./use-merchant-qr";
import { MerchantPosterCard } from "./poster-card";

type QrView = "qr" | "poster";

const VIEWS: { value: QrView; label: string }[] = [
  { value: "qr", label: "QR code" },
  { value: "poster", label: "Poster" },
];

const QR_COPY: Record<
  MerchantProduct,
  { title: string; caption: string; openLabel: string; tip: string; alt: string }
> = {
  loyalty: {
    title: "Loyalty QR",
    caption: "Customers scan this QR to join your loyalty program.",
    openLabel: "Open Join Page",
    tip: "Display near your counter for the best scan rate.",
    alt: "Loyalty join QR code",
  },
  queue: {
    title: "Queue QR",
    caption: "Guests scan this QR to join your live waitlist.",
    openLabel: "Open Queue Page",
    tip: "Display at your entrance for the best scan rate.",
    alt: "Queue join QR code",
  },
  reservation: {
    title: "Reservation QR",
    caption: "Guests scan this QR to request a table.",
    openLabel: "Open Booking Page",
    tip: "Display at your entrance or share the link with guests.",
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
  const [copied, setCopied] = useState(false);
  const { qrUrl, joinUrl, displayUrl, download } = useMerchantQr(profile, product);
  const copy = QR_COPY[product];
  // The printable poster template only exists for loyalty.
  const posterAvailable = product === "loyalty";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      toast.success("Link copied");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="merchant-settings-group">
      <h3 className="merchant-settings-title">{copy.title}</h3>
      <div className="panel-card merchant-qr-panel">
        {posterAvailable ? (
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
        ) : null}

        {view === "qr" || !posterAvailable ? (
          <>
            <p className="merchant-qr-caption">{copy.caption}</p>

            <div className="merchant-qr-frame merchant-qr-frame--lg">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="merchant-qr-img"
                  src={qrUrl}
                  alt={copy.alt}
                  width={240}
                  height={240}
                />
              ) : (
                <div className="merchant-qr-skeleton" aria-hidden="true" />
              )}
            </div>

            <p className="merchant-qr-drawer-tip">{copy.tip}</p>

            <div className="merchant-qr-link">
              <span className="merchant-qr-link-text" title={displayUrl}>
                {displayUrl}
              </span>
              <button
                type="button"
                className="merchant-qr-link-copy"
                onClick={() => void copyLink()}
                aria-label={copied ? "Link copied" : "Copy link"}
              >
                {copied ? (
                  <Check size={15} strokeWidth={2.6} />
                ) : (
                  <Copy size={15} strokeWidth={2.3} />
                )}
              </button>
            </div>

            <div className="merchant-qr-actions">
              <button
                type="button"
                className="cta-btn merchant-cta-accent merchant-qr-action"
                onClick={download}
                disabled={!qrUrl}
              >
                <Download size={17} strokeWidth={2.3} />
                Download QR
              </button>
              <a
                className="cta-btn merchant-qr-open merchant-qr-action"
                href={joinUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={17} strokeWidth={2.3} />
                {copy.openLabel}
              </a>
            </div>
          </>
        ) : (
          <MerchantPosterCard caption="A ready-to-print poster with your loyalty QR placed on the Froq template." />
        )}
      </div>
    </div>
  );
}
