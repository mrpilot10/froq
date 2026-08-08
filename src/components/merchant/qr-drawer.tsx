"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink, Lock } from "lucide-react";
import { toast } from "sonner";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { MerchantPosterCard } from "./poster-card";
import { useMerchantQr } from "./use-merchant-qr";
import { posterAvailableFor } from "@/lib/merchant/poster-availability";

type QrView = "qr" | "poster";

const VIEWS: { value: QrView; label: string }[] = [
  { value: "qr", label: "QR code" },
  { value: "poster", label: "Poster" },
];

const DRAWER_COPY: Record<
  MerchantProduct,
  {
    title: string;
    productName: string;
    /** Short line under the title — never repeats the business name. */
    sub: string;
    lockedSub: string;
    tip: string;
    openLabel: string;
    alt: string;
  }
> = {
  loyalty: {
    title: "Loyalty QR",
    productName: "Loyalty Stamps",
    sub: "Use this QR to enroll customers.",
    lockedSub: "Customers will scan this to join your loyalty program.",
    tip: "Display near your counter for the best scan rate.",
    openLabel: "Open Loyalty Page",
    alt: "Loyalty join QR code",
  },
  queue: {
    title: "Queue QR",
    productName: "Smart Queue",
    sub: "Guests scan this QR to join your live waitlist.",
    lockedSub: "Guests will scan this to join your live waitlist.",
    tip: "Display at your entrance for the best scan rate.",
    openLabel: "Open Queue Page",
    alt: "Queue join QR code",
  },
  reservation: {
    title: "Reservation QR",
    productName: "Reservations",
    sub: "Guests scan this QR to request a table.",
    lockedSub: "Guests will scan this to request a table.",
    tip: "Display at your entrance or share the link with guests.",
    openLabel: "Open Booking Page",
    alt: "Reservation request QR code",
  },
  menu: {
    title: "Menu QR",
    productName: "AI Menu",
    sub: "Guests scan this QR to open your AI menu.",
    lockedSub: "Guests will scan this to open your AI menu.",
    tip: "Put one on every table so guests can ask and order from their seat.",
    openLabel: "Open Menu Page",
    alt: "AI menu QR code",
  },
};

interface MerchantQrDrawerProps {
  open: boolean;
  profile: MerchantProfile;
  product?: MerchantProduct;
  enabled?: boolean;
  branchSlug?: string | null;
  branchName?: string | null;
  onClose: () => void;
}

export function MerchantQrDrawer({
  open,
  profile,
  product = "loyalty",
  enabled = true,
  branchSlug = null,
  branchName = null,
  onClose,
}: MerchantQrDrawerProps) {
  const { qrUrl, joinUrl, displayUrl, download } = useMerchantQr(
    profile,
    product,
    branchSlug,
  );
  const copy = DRAWER_COPY[product];
  const locked = !enabled;
  const posterAvailable = posterAvailableFor(product);
  const [view, setView] = useState<QrView>("qr");
  const [copied, setCopied] = useState(false);

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

  if (locked) {
    return (
      <BottomSheet
        open={open}
        onClose={onClose}
        labelledBy="merchant-qr-title"
        className="merchant-theme"
      >
        <div className="merchant-qr-drawer">
          <div className="merchant-qr-drawer-head">
            <h3 id="merchant-qr-title" className="merchant-qr-drawer-title">
              {copy.title}
            </h3>
            <p className="merchant-qr-drawer-sub">{copy.lockedSub}</p>
          </div>

          <div className="merchant-qr-frame merchant-qr-frame--hero merchant-qr-frame--locked">
            <div className="merchant-qr-locked">
              <Lock size={26} strokeWidth={2.2} />
              <span>Unlocks with {copy.productName}</span>
            </div>
          </div>

          <p className="merchant-qr-drawer-tip">
            Get started with {copy.productName} to generate your {copy.title.toLowerCase()}.
          </p>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="merchant-qr-title"
      className="merchant-theme"
    >
      <div className="merchant-qr-drawer">
        <div className="merchant-qr-drawer-head">
          <h3 id="merchant-qr-title" className="merchant-qr-drawer-title">
            {copy.title}
          </h3>
          <p className="merchant-qr-drawer-sub">
            {product === "loyalty"
              ? branchName
                ? (
                    <>
                      Use this QR to enroll customers. Every branch has its own code — this one is
                      for <strong>{branchName}</strong>.
                    </>
                  )
                : "Use this QR to enroll customers. Every branch has its own code — download the correct one."
              : copy.sub}
          </p>
        </div>

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
            <div className="merchant-qr-frame merchant-qr-frame--hero">
              {qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="merchant-qr-img"
                  src={qrUrl}
                  alt={copy.alt}
                  width={288}
                  height={288}
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
          <MerchantPosterCard product={product} branchSlug={branchSlug} />
        )}
      </div>
    </BottomSheet>
  );
}
