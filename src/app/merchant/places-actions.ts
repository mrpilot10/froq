"use server";

import { persistGooglePlacesUsage } from "@/lib/google/places-usage-store";
import {
  PlacesSearchError,
  searchGooglePlaces,
  type GooglePlaceResult,
  type PlacesSearchLocation,
} from "@/lib/merchant/places";

export type SearchPlacesActionResult =
  | { ok: true; results: GooglePlaceResult[] }
  | { ok: false; message: string };

/**
 * Server-side Places text search with usage metering.
 * Use this from client components instead of calling the worker directly.
 */
export async function searchPlacesAction(input: {
  query: string;
  location?: PlacesSearchLocation | null;
  merchantId?: string | null;
}): Promise<SearchPlacesActionResult> {
  const query = input.query.trim();
  if (query.length < 3) return { ok: true, results: [] };

  try {
    const results = await searchGooglePlaces(query, input.location ?? null);
    void persistGooglePlacesUsage({
      kind: "text_search",
      path: "worker",
      status: "ok",
      merchantId: input.merchantId,
      queryChars: query.length,
      resultCount: results.length,
      httpStatus: 200,
    });
    return { ok: true, results };
  } catch (error) {
    const message =
      error instanceof PlacesSearchError
        ? error.message
        : "Places search failed. Try again.";
    const httpStatus =
      error instanceof PlacesSearchError ? error.status : null;
    const errorCode =
      error instanceof PlacesSearchError ? error.code ?? null : null;
    void persistGooglePlacesUsage({
      kind: "text_search",
      path: "worker",
      status: "failed",
      merchantId: input.merchantId,
      queryChars: query.length,
      resultCount: 0,
      httpStatus,
      errorCode,
    });
    return { ok: false, message };
  }
}
