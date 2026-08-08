/** Guest + merchant shape for AI Menu table offers. */

export const OFFER_BADGE_MAX = 12;
export const OFFER_TITLE_MAX = 28;
export const OFFER_DETAIL_MAX = 60;
export const OFFER_MAX_COUNT = 20;

export type MenuOffer = {
  id: string;
  badge: string;
  title: string;
  detail: string;
  isActive: boolean;
  sortOrder: number;
};

/** Guest sheet card — no ids or inactive flags. */
export type GuestMenuOffer = {
  badge: string;
  title: string;
  detail: string;
};

export function sanitizeOfferBadge(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, OFFER_BADGE_MAX);
}

export function sanitizeOfferTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, OFFER_TITLE_MAX);
}

export function sanitizeOfferDetail(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, OFFER_DETAIL_MAX);
}

export function toGuestOffers(offers: MenuOffer[]): GuestMenuOffer[] {
  return offers
    .filter((offer) => offer.isActive)
    .map((offer) => ({
      badge: offer.badge,
      title: offer.title,
      detail: offer.detail,
    }));
}
