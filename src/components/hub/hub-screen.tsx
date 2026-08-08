"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { ArrowUpRight, ChevronRight, Star } from "lucide-react";

import { BusinessContactRow } from "@/components/loyalty/business-contact-row";
import { GoogleIcon } from "@/components/loyalty/icons";
import { FollowUs } from "@/components/loyalty/social-row";
import { FroqFooter } from "@/components/shared/froq-footer";
import type { MerchantProduct } from "@/lib/merchant/types";
import type { HubPageMerchant } from "@/app/b/actions";
import { MenuArt, QueueArt, ReservationArt, StampsArt } from "./hub-illustrations";

/**
 * The page behind a merchant's one QR: who they are, what Google thinks, and
 * a tile for every product they've switched on. Built out of the same shell as
 * the join / queue / booking screens so a guest never feels handed off.
 */

type TileCopy = {
  eyebrow: string;
  title: string;
  sub: string;
  /** Only the full-width tiles have room for a button; the rest use the corner arrow. */
  cta?: string;
  path: (slug: string) => string;
  Art: (props: { className?: string }) => ReactNode;
};

const TILES: Record<MerchantProduct, TileCopy> = {
  menu: {
    eyebrow: "AI Menu",
    title: "See the menu",
    sub: "Browse every dish, ask the AI what's good, and build your order.",
    cta: "View menu",
    path: (slug) => `/menu/${slug}`,
    Art: MenuArt,
  },
  loyalty: {
    eyebrow: "Rewards",
    title: "Collect stamps",
    sub: "A stamp on every visit.",
    path: (slug) => `/join/${slug}`,
    Art: StampsArt,
  },
  queue: {
    eyebrow: "Waitlist",
    title: "Join the queue",
    sub: "We'll text when it's ready.",
    path: (slug) => `/queue/${slug}`,
    Art: QueueArt,
  },
  reservation: {
    eyebrow: "Bookings",
    title: "Book a table",
    sub: "Pick a date, time and party size — we'll confirm your spot.",
    cta: "Book now",
    path: (slug) => `/r/${slug}`,
    Art: ReservationArt,
  },
};

/** Cycled over the non-hero tiles so the grid reads as a bento, not a list. */
const TINTS = ["a", "b", "c"];

function brandInitial(businessName: string) {
  const match = businessName.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? "?").toUpperCase();
}

/**
 * The lead tile always runs full width, and so does a trailing odd one —
 * otherwise the last product sits alone in a half-width column.
 */
function isWide(index: number, total: number) {
  if (index === 0) return true;
  return index === total - 1 && (total - 1) % 2 === 1;
}

function ratingLabel(count: number) {
  if (count <= 0) return "Rated on Google";
  return `${count.toLocaleString("en-IN")} Google review${count === 1 ? "" : "s"}`;
}

export function HubScreen({ merchant }: { merchant: HubPageMerchant }) {
  const {
    slug,
    businessName,
    brandColor,
    logoUrl,
    branchName,
    phone,
    address,
    googleMapsUrl,
    socialLinks,
    rating,
    products,
    branchSlug,
  } = merchant;

  const query = branchSlug ? `?b=${encodeURIComponent(branchSlug)}` : "";
  const ratingHref = googleMapsUrl || rating?.mapsUrl || socialLinks.googleReviews;

  return (
    <div className="loyalty-page hub-page">
      <div className="loyalty-screen hub-screen">
        <header className="merchant-auth-head hub-head">
          <div className="merchant-auth-logo" style={{ background: brandColor }}>
            {logoUrl ? (
              <Image src={logoUrl} alt={businessName} width={88} height={88} unoptimized />
            ) : (
              <span className="merchant-auth-logo-letter" aria-hidden="true">
                {brandInitial(businessName)}
              </span>
            )}
          </div>

          <h1 className="merchant-auth-brand">{businessName}</h1>
          {branchName ? <p className="merchant-auth-tag">{branchName}</p> : null}

          {rating ? (
            <a
              className="hub-rating"
              href={ratingHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Rated ${rating.rating.toFixed(1)} out of 5 on Google`}
            >
              <Star size={14} strokeWidth={0} fill="currentColor" />
              <strong>{rating.rating.toFixed(1)}</strong>
              <span className="hub-rating-count">{ratingLabel(rating.reviewCount)}</span>
            </a>
          ) : null}

          <BusinessContactRow
            phone={phone}
            address={address}
            googleMapsUrl={googleMapsUrl}
            website={socialLinks.website}
          />
        </header>

        {products.length > 0 ? (
          <div className="hub-bento">
            {products.map((product, index) => {
              const tile = TILES[product];
              const wide = isWide(index, products.length);
              const hero = index === 0;
              const tint = hero ? "" : ` hub-tile--tint-${TINTS[(index - 1) % TINTS.length]}`;
              // A button only fits on a full-width tile; elsewhere the corner arrow carries it.
              const cta = wide ? tile.cta : undefined;
              return (
                <a
                  key={product}
                  className={`hub-tile${wide ? " hub-tile--wide" : ""}${hero ? " hub-tile--hero" : ""}${cta ? " hub-tile--cta" : ""}${tint}`}
                  href={`${tile.path(slug)}${query}`}
                >
                  <div className="hub-tile-body">
                    <span className="hub-tile-eyebrow">{tile.eyebrow}</span>
                    <h2 className="hub-tile-title">{tile.title}</h2>
                    <p className="hub-tile-sub">{tile.sub}</p>
                    {cta ? (
                      <span className="hub-tile-cta">
                        {cta}
                        <ArrowUpRight size={14} strokeWidth={2.8} />
                      </span>
                    ) : null}
                  </div>
                  <span className="hub-tile-art" aria-hidden="true">
                    <tile.Art />
                  </span>
                  {cta ? null : (
                    <span className="hub-tile-arrow" aria-hidden="true">
                      <ArrowUpRight size={16} strokeWidth={2.6} />
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <p className="hub-empty">
            Nothing to open here yet — ask our team and we&apos;ll get you sorted.
          </p>
        )}

        {socialLinks.googleReviews ? (
          <a
            className="review-btn hub-review"
            href={socialLinks.googleReviews}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="review-btn-icon">
              <GoogleIcon />
            </div>
            <div className="review-btn-text">
              <div className="review-btn-title">Leave a Google review</div>
              <div className="review-btn-sub">Takes less than a minute</div>
            </div>
            <div className="review-btn-arrow">
              <ChevronRight size={14} strokeWidth={2.4} color="#fff" />
            </div>
          </a>
        ) : null}

        <FollowUs links={socialLinks} className="follow-us follow-us--footer" />
        <FroqFooter />
      </div>
    </div>
  );
}
