"use client";

import { Download, ExternalLink, Lock } from "lucide-react";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { useMerchantQr } from "./use-merchant-qr";

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
  const isQueue = product === "queue";
  const branchNote = branchName ? ` · ${branchName}` : "";
  const locked = !enabled;

  if (locked) {
    return (
      <BottomSheet open={open} onClose={onClose} labelledBy="merchant-qr-title" className="merchant-theme">
        <div className="merchant-qr-drawer">
          <div className="merchant-qr-drawer-head">
            <h3 id="merchant-qr-title" className="merchant-qr-drawer-title">
              Queue QR
            </h3>
            <p className="merchant-qr-drawer-sub">
              Guests will scan this to join {profile.businessName}&apos;s live queue.
            </p>
          </div>

          <div className="merchant-qr-frame merchant-qr-frame--lg merchant-qr-frame--locked">
            <div className="merchant-qr-locked">
              <Lock size={26} strokeWidth={2.2} />
              <span>Unlocks with Queue Management</span>
            </div>
          </div>

          <p className="merchant-qr-drawer-sub">
            Get started with Queue Management to generate your queue join code.
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
            {isQueue ? "Queue QR" : "Scan to join"}
            {branchNote}
          </h3>
          <p className="merchant-qr-drawer-sub">
            {isQueue
              ? `Guests scan this to join ${profile.businessName}'s live waitlist.`
              : `Customers scan this code to join ${profile.businessName}'s loyalty card.`}
          </p>
        </div>

        <div className="merchant-qr-frame merchant-qr-frame--lg">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="merchant-qr-img"
              src={qrUrl}
              alt={isQueue ? "Queue join QR code" : "Loyalty join QR code"}
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
