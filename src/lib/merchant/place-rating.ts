import "server-only";

/**
 * Google rating + review count for one place, read server-side.
 *
 * Two paths: a direct Places call when this deployment owns a key, otherwise
 * the Froq Cloudflare Worker that already fronts Places for onboarding search.
 * Either way the rating is decoration — every failure returns null so the
 * landing page renders without it rather than blocking on Google.
 */

import { persistGooglePlacesUsage } from "@/lib/google/places-usage-store";

const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const WORKER_DETAILS_URL =
  (process.env.AI_WORKER_URL?.trim()?.replace(/\/$/, "") ||
    "https://froq-apoi.capt-tanmay10.workers.dev") + "/places/details";
const DETAILS_FIELD_MASK = "rating,userRatingCount,googleMapsUri";

/** Ratings move slowly and every lookup is billed, so a scan burst costs one call. */
const CACHE_SECONDS = 21600;

export type PlaceRating = {
  /** Star average, e.g. 4.7. */
  rating: number;
  /** How many reviews back it. */
  reviewCount: number;
  /** Google's own listing URL, when it returned one. */
  mapsUrl?: string;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toRating(payload: unknown): PlaceRating | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;

  // The worker normalises to reviewCount; a direct Places call says userRatingCount.
  const rating = toNumber(row.rating);
  const reviewCount = toNumber(row.reviewCount ?? row.userRatingCount);
  if (rating == null || rating <= 0) return null;

  const mapsUrl = row.googleMapsUrl ?? row.googleMapsUri;
  return {
    rating,
    reviewCount: reviewCount != null && reviewCount > 0 ? Math.round(reviewCount) : 0,
    mapsUrl: typeof mapsUrl === "string" && mapsUrl.trim() ? mapsUrl.trim() : undefined,
  };
}

function placesApiKey(): string | null {
  const key =
    process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  return key || null;
}

/** Star rating for a merchant's Google listing, or null when unavailable. */
export async function fetchPlaceRating(
  placeId?: string | null,
): Promise<PlaceRating | null> {
  const id = placeId?.trim().replace(/^places\//, "");
  if (!id) return null;

  const key = placesApiKey();
  const path = key ? "direct" : "worker";

  try {
    const res = key
      ? await fetch(`${PLACE_DETAILS_URL}/${encodeURIComponent(id)}`, {
          headers: {
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": DETAILS_FIELD_MASK,
          },
          next: { revalidate: CACHE_SECONDS },
        })
      : await fetch(`${WORKER_DETAILS_URL}?placeId=${encodeURIComponent(id)}`, {
          headers: process.env.AI_WORKER_TOKEN?.trim()
            ? { Authorization: `Bearer ${process.env.AI_WORKER_TOKEN.trim()}` }
            : undefined,
          next: { revalidate: CACHE_SECONDS },
        });

    if (!res.ok) {
      void persistGooglePlacesUsage({
        kind: "place_details",
        path,
        status: "failed",
        httpStatus: res.status,
        resultCount: 0,
      });
      return null;
    }
    const rating = toRating(await res.json());
    void persistGooglePlacesUsage({
      kind: "place_details",
      path,
      status: rating ? "ok" : "failed",
      httpStatus: res.status,
      resultCount: rating ? 1 : 0,
    });
    return rating;
  } catch {
    void persistGooglePlacesUsage({
      kind: "place_details",
      path,
      status: "failed",
      resultCount: 0,
    });
    return null;
  }
}
