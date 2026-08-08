/** Structured pieces of the address, used to name a branch. */
export type GoogleAddressParts = {
  /** Neighbourhood, e.g. "Koregaon Park". */
  sublocality?: string;
  /** City, e.g. "Pune". */
  locality?: string;
  /** Street, e.g. "Lane 7". */
  route?: string;
  /** State, e.g. "MH". */
  administrativeArea?: string;
};

export type GooglePlaceResult = {
  placeId: string;
  name: string;
  address: string;
  googleMapsUrl: string;
  addressParts: GoogleAddressParts;
};

export type PlacesSearchLocation = {
  latitude: number;
  longitude: number;
};

const PLACES_SEARCH_URL =
  (typeof process !== "undefined" && process.env.AI_WORKER_URL?.trim()
    ? process.env.AI_WORKER_URL.trim().replace(/\/$/, "")
    : "https://froq-apoi.capt-tanmay10.workers.dev") + "/places/search";

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
 * Pass device coords when available so results bias to the merchant's area.
 * Throws PlacesSearchError with a user-facing message on failure.
 *
 * Prefer {@link searchPlacesAction} from client UI so calls are metered.
 */
export async function searchGooglePlaces(
  query: string,
  location?: PlacesSearchLocation | null,
): Promise<GooglePlaceResult[]> {
  const textQuery = query.trim();
  if (textQuery.length < 3) return [];

  const body: Record<string, unknown> = { textQuery, regionCode: "IN" };
  if (
    location &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  ) {
    body.latitude = location.latitude;
    body.longitude = location.longitude;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const workerToken =
    typeof process !== "undefined"
      ? process.env.AI_WORKER_TOKEN?.trim()
      : undefined;
  if (workerToken) {
    headers.Authorization = `Bearer ${workerToken}`;
  }

  let res: Response;
  try {
    res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
    const errBody = payload as { error?: string; code?: string } | null;
    throw new PlacesSearchError(
      errBody?.error || "Places search failed. Try again.",
      res.status,
      errBody?.code,
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
      return { placeId, name, address, googleMapsUrl, addressParts: toAddressParts(r.addressParts) };
    })
    .filter((row): row is GooglePlaceResult => row != null);
}

function toAddressParts(raw: unknown): GoogleAddressParts {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as Record<string, unknown>;
  const read = (key: string) => {
    const value = source[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  return {
    sublocality: read("sublocality"),
    locality: read("locality"),
    route: read("route"),
    administrativeArea: read("administrativeArea"),
  };
}

/** First meaningful segment of a formatted address, skipping bare street numbers. */
function firstAddressLine(address: string): string {
  const segments = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return segments.find((part) => /[a-z]/i.test(part)) ?? "";
}

/**
 * Names a branch from its location. Google returns the same display name for
 * every outlet of a chain, so the neighbourhood (falling back to city, then
 * street) is the only thing that tells two branches apart.
 */
export function branchLabelFromPlace(place: {
  address: string;
  addressParts?: GoogleAddressParts;
}): string {
  const parts = place.addressParts ?? {};
  return (
    parts.sublocality ||
    parts.locality ||
    parts.route ||
    firstAddressLine(place.address) ||
    ""
  );
}

/**
 * Appends the street when a label already exists, so two outlets in the same
 * neighbourhood don't both end up called "Koregaon Park".
 */
export function uniqueBranchLabel(
  label: string,
  place: { address: string; addressParts?: GoogleAddressParts },
  takenLabels: string[],
): string {
  const base = label.trim();
  if (!base) return "";
  const taken = new Set(takenLabels.map((name) => name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;

  const parts = place.addressParts ?? {};
  const qualifiers = [parts.route, parts.locality, firstAddressLine(place.address)];
  for (const qualifier of qualifiers) {
    if (!qualifier || qualifier.toLowerCase() === base.toLowerCase()) continue;
    const candidate = `${base} (${qualifier})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }

  for (let n = 2; n < 50; n += 1) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}
