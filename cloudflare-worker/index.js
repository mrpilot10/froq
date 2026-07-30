/**
 * Cloudflare Worker — Google Places search endpoint.
 *
 * Deployed as the `froq-apoi` Worker:
 * https://froq-apoi.capt-tanmay10.workers.dev
 *
 * Deploy with:
 *   npx wrangler deploy cloudflare-worker/index.js --name froq-apoi \
 *     --compatibility-date 2024-11-01
 *
 * Requires a Secret named GOOGLE_API_KEY. The key must have NO HTTP-referrer
 * restriction — Workers call Google server-side and send no referer.
 *
 * If this Worker already has other routes, merge the `/places/search` branch
 * (and CORS helpers) into your existing fetch handler.
 */

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.googleMapsUri";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function error(status, message, code) {
  return json({ error: message, code }, status);
}

function placeIdFromResource(id) {
  if (!id || typeof id !== "string") return "";
  return id.startsWith("places/") ? id.slice("places/".length) : id;
}

async function handlePlacesSearch(request, env) {
  if (!env.GOOGLE_API_KEY) {
    return error(500, "GOOGLE_API_KEY is not configured.", "missing_api_key");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Request body must be JSON.", "invalid_json");
  }

  const textQuery =
    typeof body?.textQuery === "string"
      ? body.textQuery.trim()
      : typeof body?.query === "string"
        ? body.query.trim()
        : "";

  if (!textQuery) {
    return error(400, "Missing search query.", "missing_query");
  }
  if (textQuery.length < 3) {
    return error(400, "Query must be at least 3 characters.", "query_too_short");
  }

  let googleRes;
  try {
    googleRes = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": env.GOOGLE_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({ textQuery }),
    });
  } catch (err) {
    return error(
      502,
      err instanceof Error ? err.message : "Failed to reach Google Places.",
      "google_network_error",
    );
  }

  let payload = {};
  try {
    payload = await googleRes.json();
  } catch {
    return error(502, "Invalid response from Google Places.", "google_bad_response");
  }

  if (!googleRes.ok) {
    const googleMessage =
      payload?.error?.message ||
      payload?.message ||
      `Google Places error (${googleRes.status}).`;
    const status = googleRes.status;

    if (status === 401 || status === 403) {
      return error(502, googleMessage, "invalid_api_key");
    }
    if (status === 429) {
      return error(429, "Google Places rate limit exceeded. Try again shortly.", "rate_limited");
    }
    if (status >= 400 && status < 500) {
      return error(400, googleMessage, "google_client_error");
    }
    return error(502, googleMessage, "google_upstream_error");
  }

  const places = Array.isArray(payload.places) ? payload.places : [];
  const results = places
    .map((place) => {
      const placeId = placeIdFromResource(place?.id);
      const name =
        (typeof place?.displayName?.text === "string" && place.displayName.text.trim()) ||
        (typeof place?.displayName === "string" && place.displayName.trim()) ||
        "";
      const address =
        typeof place?.formattedAddress === "string" ? place.formattedAddress.trim() : "";
      const googleMapsUrl =
        typeof place?.googleMapsUri === "string" ? place.googleMapsUri.trim() : "";

      if (!placeId || !name) return null;
      return { placeId, name, address, googleMapsUrl };
    })
    .filter(Boolean);

  return json(results);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/places/search") {
      if (request.method !== "POST") {
        return error(405, "Method not allowed. Use POST.", "method_not_allowed");
      }
      return handlePlacesSearch(request, env);
    }

    return error(404, "Not found.", "not_found");
  },
};
