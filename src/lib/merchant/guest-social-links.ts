/**
 * Guest-facing social / contact links for loyalty + queue.
 * Branch values win over merchant fallbacks (same coalesce as onboarding).
 */

export type GuestSocialLinks = {
  instagram?: string;
  whatsapp?: string;
  facebook?: string;
  website?: string;
  googleReviews?: string;
};

export type GuestLinkSource = {
  website_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  google_business_url?: string | null;
  google_place_id?: string | null;
};

/** Ensures a stored link (often saved without a scheme) is an absolute URL. */
export function toExternalUrl(raw?: string | null): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function pick(
  branchValue: string | null | undefined,
  merchantValue: string | null | undefined,
): string | undefined {
  return branchValue?.trim() || merchantValue?.trim() || undefined;
}

/** Google “write a review” deep link from a Places place id. */
export function googleReviewsUrlFromPlaceId(
  placeId?: string | null,
): string | undefined {
  const id = placeId?.trim();
  if (!id) return undefined;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Merchants sometimes paste Instagram/Facebook into “Website”.
 * Promote those into Follow Us icons and drop the contact-row globe.
 */
function reclassifyWebsiteAsSocial(links: GuestSocialLinks): GuestSocialLinks {
  const website = links.website;
  if (!website) return links;

  const host = hostnameOf(website);
  if (!host) return links;

  const next = { ...links };

  if (!next.facebook && (host === "facebook.com" || host === "fb.com" || host === "m.facebook.com")) {
    next.facebook = website;
    delete next.website;
    return next;
  }

  if (
    !next.instagram &&
    (host === "instagram.com" || host === "instagr.am")
  ) {
    next.instagram = website;
    delete next.website;
    return next;
  }

  return next;
}

/**
 * Resolve Instagram / Facebook / website / Google reviews for guest chrome.
 * Prefer explicit google_business_url; else derive reviews from place id.
 */
export function resolveGuestSocialLinks(
  branch?: GuestLinkSource | null,
  merchant?: GuestLinkSource | null,
): GuestSocialLinks {
  const googleReviews =
    toExternalUrl(pick(branch?.google_business_url, merchant?.google_business_url)) ||
    googleReviewsUrlFromPlaceId(pick(branch?.google_place_id, merchant?.google_place_id));

  const links: GuestSocialLinks = {
    instagram: toExternalUrl(pick(branch?.instagram_url, merchant?.instagram_url)),
    facebook: toExternalUrl(pick(branch?.facebook_url, merchant?.facebook_url)),
    website: toExternalUrl(pick(branch?.website_url, merchant?.website_url)),
    googleReviews,
  };

  return reclassifyWebsiteAsSocial(links);
}
