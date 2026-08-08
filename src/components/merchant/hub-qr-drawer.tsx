"use client";

import { useState } from "react";
import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/loyalty/bottom-sheet";
import { PRODUCTS } from "@/lib/merchant/nav";
import { isProductEnabled, type Entitlements } from "@/lib/merchant/entitlements";
import type { MerchantProduct, MerchantProfile } from "@/lib/merchant/types";
import { useMerchantQr } from "./use-merchant-qr";

/**
 * The one QR a merchant can print for the whole counter. It opens `/b/{slug}`,
 * which lists every product they've switched on, so the table tent doesn't have
 * to be reprinted the day they add bookings.
 */

/** Same reading order as the landing page's bento grid. */
const HUB_ORDER: MerchantProduct[] = ["menu", "loyalty", "queue", "reservation"];

interface HubQrDrawerProps {
  open: boolean;
  profile: MerchantProfile;
  entitlements: Entitlements;
  branchSlug?: string | null;
  branchName?: string | null;
  onClose: () => void;
}

export function HubQrDrawer({
  open,
  profile,
  entitlements,
  branchSlug = null,
  branchName = null,
  onClose,
}: HubQrDrawerProps) {
  const { qrUrl, joinUrl, displayUrl, download } = useMerchantQr(
    profile,
    "hub",
    branchSlug,
  );
  const [copied, setCopied] = useState(false);

  const included = HUB_ORDER.filter((product) =>
    isProductEnabled(entitlements, product),
  );

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
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="merchant-hub-qr-title"
      className="merchant-theme"
    >
      <div className="merchant-qr-drawer">
        <div className="merchant-qr-drawer-head">
          <h3 id="merchant-hub-qr-title" className="merchant-qr-drawer-title">
            Your QR
          </h3>
          <p className="merchant-qr-drawer-sub">
            {branchName ? (
              <>
                One code for everything guests can do at <strong>{branchName}</strong>.
              </>
            ) : (
              "One code for everything guests can do — it updates itself as you switch products on."
            )}
          </p>
        </div>

        <div className="merchant-qr-frame merchant-qr-frame--hero">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="merchant-qr-img"
              src={qrUrl}
              alt="QR code for your business page"
              width={288}
              height={288}
            />
          ) : (
            <div className="merchant-qr-skeleton" aria-hidden="true" />
          )}
        </div>

        {included.length > 0 ? (
          <div className="merchant-hub-chips" aria-label="On this page">
            {included.map((product) => {
              const meta = PRODUCTS.find((entry) => entry.id === product);
              if (!meta) return null;
              const Icon = meta.Icon;
              return (
                <span key={product} className="merchant-hub-chip">
                  <Icon size={14} strokeWidth={2.3} />
                  {meta.name}
                </span>
              );
            })}
          </div>
        ) : null}

        <p className="merchant-qr-drawer-tip">
          Print it once for the counter, the table tents and the door.
        </p>

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
            Open Page
          </a>
        </div>
      </div>
    </BottomSheet>
  );
}
