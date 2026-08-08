/**
 * Estimated Google Places API (New) list prices in USD per request.
 * Source: Google Maps Platform pricing — update when SKUs change.
 *
 * Froq mainly uses:
 * - Text Search Essentials SKU via the froq-apoi worker (onboarding search)
 * - Place Details Essentials (rating / review count)
 *
 * "Autocomplete" in the admin UI maps to our text_search usage until a
 * dedicated Autocomplete session endpoint is introduced.
 */

export type GooglePlacesKind = "text_search" | "place_details" | "autocomplete";

/** USD per successful request. */
export const GOOGLE_PLACES_USD_PER_REQUEST = {
  /** Places API Text Search (IDs Only) / Essentials-tier proxy. */
  text_search: 0.032,
  /** Place Details Essentials (Place Details ID + basic fields). */
  place_details: 0.017,
  /** Autocomplete (per request) — reserved for future metering. */
  autocomplete: 0.00283,
} as const satisfies Record<GooglePlacesKind, number>;

export const GOOGLE_PLACES_RATES_UPDATED_AT = "2026-08-07";

export const USD_INR = 84;

export function costUsdForPlacesKind(kind: GooglePlacesKind): number {
  return GOOGLE_PLACES_USD_PER_REQUEST[kind];
}

export function costInrForPlacesKind(kind: GooglePlacesKind): number {
  return costUsdForPlacesKind(kind) * USD_INR;
}
