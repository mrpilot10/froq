"use client";

import { Download, ExternalLink, Lock } from "lucide-react";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { useMerchantQr } from "./use-merchant-qr";

const DRAWER_COPY: Record<
  MerchantProduct,
  {
    title: string;
    productName: string;
    sub: (name: string) => string;
    lockedSub: (name: string) => string;
    alt: string;
  }
> = {
  loyalty: {
    title: "Loyalty QR",
    productName: "Loyalty Stamps",
    sub: (name) => `Customers scan this code to join ${name}'s loyalty card.`,
    lockedSub: (name) => `Customers will scan this to join ${name}'s loyalty card.`,
    alt: "Loyalty join QR code",
  },
  queue: {
    title: "Queue QR",
    productName: "Queue Management",
    sub: (name) => `Guests scan this to join ${name}'s live waitlist.`,
    lockedSub: (name) => `Guests will scan this to join ${name}'s live queue.`,
    alt: "Queue join QR code",
  },
  reservation: {
    title: "Reservation QR",
    productName: "Reservations",
    sub: (name) => `Guests scan this to request a table at ${name}.`,
    lockedSub: (name) => `Guests will scan this to request a table at ${name}.`,
    alt: "Reservation request QR code",
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
  const { qrUrl, joinUrl, download } = useMerchantQr(profile, product, branchSlug);
  const copy = DRAWER_COPY[product];
  const branchNote = branchName ? ` · ${branchName}` : "";
  const locked = !enabled;

  if (locked) {
    return (
      <BottomSheet open={open} onClose={onClose} labelledBy="merchant-qr-title" className="merchant-theme">
        <div className="merchant-qr-drawer">
          <div className="merchant-qr-drawer-head">
            <h3 id="merchant-qr-title" className="merchant-qr-drawer-title">
              {copy.title}
            </h3>
            <p className="merchant-qr-drawer-sub">{copy.lockedSub(profile.businessName)}</p>
          </div>

          <div className="merchant-qr-frame merchant-qr-frame--lg merchant-qr-frame--locked">
            <div className="merchant-qr-locked">
              <Lock size={26} strokeWidth={2.2} />
              <span>Unlocks with {copy.productName}</span>
            </div>
          </div>

          <p className="merchant-qr-drawer-sub">
            Get started with {copy.productName} to generate your {copy.title.toLowerCase()}.
          </p>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="merchant-qr-title" className="merchant-theme">
      <div className="merchant-qr-drawer">
        <div className="merchant-qr-drawer-head">
          <h3 id="merchant-qr-title" className="merchant-qr-drawer-title">
            {copy.title}
            {branchNote}
          </h3>
          <p className="merchant-qr-drawer-sub">{copy.sub(profile.businessName)}</p>
        </div>

        <div className="merchant-qr-frame merchant-qr-frame--lg">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="merchant-qr-img"
              src={qrUrl}
              alt={copy.alt}
              width={260}
              height={260}
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
            Download QR
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
