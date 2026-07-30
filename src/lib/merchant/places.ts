export type GooglePlaceResult = {
  placeId: string;
  name: string;
  address: string;
  googleMapsUrl: string;
};

const PLACES_SEARCH_URL = "https://froq-apoi.capt-tanmay10.workers.dev/places/search";

export class PlacesSearchError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "PlacesSearchError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Search Google Places via the Froq Cloudflare Worker.
 * Throws PlacesSearchError with a user-facing message on failure.
 */
export async function searchGooglePlaces(query: string): Promise<GooglePlaceResult[]> {
  const textQuery = query.trim();
  if (textQuery.length < 3) return [];

  let res: Response;
  try {
    res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textQuery }),
    });
  } catch {
    throw new PlacesSearchError("Could not reach Places search. Check your connection.", 0);
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    throw new PlacesSearchError("Unexpected response from Places search.", res.status);
  }

  if (!res.ok) {
    const body = payload as { error?: string; code?: string } | null;
    throw new PlacesSearchError(
      body?.error || "Places search failed. Try again.",
      res.status,
      body?.code,
    );
  }

  if (!Array.isArray(payload)) {
    throw new PlacesSearchError("Unexpected response from Places search.", res.status);
  }

  return payload
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const placeId = typeof r.placeId === "string" ? r.placeId.trim() : "";
      const name = typeof r.name === "string" ? r.name.trim() : "";
      const address = typeof r.address === "string" ? r.address.trim() : "";
      const googleMapsUrl = typeof r.googleMapsUrl === "string" ? r.googleMapsUrl.trim() : "";
      if (!placeId || !name) return null;
      return { placeId, name, address, googleMapsUrl };
    })
    .filter((row): row is GooglePlaceResult => row != null);
}
