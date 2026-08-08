/**
 * Cloudflare Worker — Google API edge for Froq.
 *
 * Routes:
 *   POST /places/search  — Google Places text search (open, called from the browser)
 *   GET  /places/details — Google Places rating + review count for one place id
 *   POST /ai/generate    — Gemini text generation (requires AI_PROXY_TOKEN)
 *   POST /ai/image       — Gemini image generation (requires AI_PROXY_TOKEN)
 *
 * Deployed as the `froq-apoi` Worker:
 * https://froq-apoi.capt-tanmay10.workers.dev
 *
 * Deploy with:
 *   npx wrangler deploy cloudflare-worker/index.js --name froq-apoi \
 *     --compatibility-date 2024-11-01
 *
 * Secrets:
 *   GOOGLE_API_KEY  — Places, and Gemini when GEMINI_API_KEY is absent. Must
 *                     have NO HTTP-referrer restriction: Workers call Google
 *                     server-side and send no referer.
 *   GEMINI_API_KEY  — preferred. Dedicated Gemini / Generative Language key
 *                     (from AI Studio). Required once Places keys and
 *                     unrestricted Google keys are blocked for Gemini.
 *   GEMINI_API      — alias for GEMINI_API_KEY (same value, either name works).
 *   AI_PROXY_TOKEN  — bearer token for /ai/generate. Without it the route is an
 *                     open Gemini proxy on a public URL, so it is required.
 */

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash";
/** Native image models — tried in order until one returns a picture. */
const IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
];
/** Guards the model path segment; new Gemini releases work without a redeploy. */
const MODEL_PATTERN = /^gemini-[a-z0-9.-]{1,48}$/;
/**
 * How much hidden reasoning the model may spend. Thoughts bill as output, so
 * an unset level means Gemini 3.x default (medium) and a much larger bill than
 * the visible answer suggests. Only the 3.x family takes `thinkingLevel`; 2.5
 * wants the legacy `thinkingBudget`, so the config is skipped there.
 */
const THINKING_LEVELS = new Set(["minimal", "low", "medium", "high"]);
const THINKING_LEVEL_MODELS = /^gemini-3/;

/**
 * Explicit context caching. The static half of a prompt (rules + the menu) is
 * uploaded once and referenced by name afterwards, which bills those tokens at
 * a tenth of the usual rate. Google will not cache a prefix below the model's
 * floor, and a cache is only worth its storage while guests keep asking, so an
 * hour is long enough to be reused across a service and short enough not to
 * bill for an empty dining room overnight.
 */
const CACHE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/cachedContents";
const CACHE_TTL_SECONDS = 3600;
/** Isolate-local memo of displayName → cache resource, so hot paths skip the lookup. */
const cacheDirectory = new Map();
/** A cold isolate walks a few pages before giving up and creating a duplicate. */
const CACHE_LIST_PAGES = 3;
/** Enough for a whole menu read out of a PDF, small enough to bound cost. */
const MAX_OUTPUT_TOKENS_CAP = 16384;
/** What a merchant can photograph or export a menu as. */
const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
/** Gemini caps an inline request around 20 MB; stay well inside it. */
const MAX_INLINE_BYTES = 15 * 1024 * 1024;
/**
 * addressComponents is what lets the app name a branch. Every outlet of a chain
 * shares one displayName ("Blue Tokai Coffee Roasters"), so only the address can
 * tell two branches apart.
 */
const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.addressComponents";
/** All the guest landing page shows: the star average and how many reviews back it. */
const DETAILS_FIELD_MASK = "rating,userRatingCount,googleMapsUri";
/**
 * A rating barely moves in a day and every lookup is billed per call, so the
 * edge holds one for six hours. Every QR scan hits this.
 */
const DETAILS_CACHE_SECONDS = 21600;
/** Default bias when the client cannot share device location (Froq is India-first). */
const DEFAULT_REGION_CODE = "IN";
/** ~50km — max circle radius Places allows. */
const DEFAULT_BIAS_RADIUS_METERS = 50000;
/** Approximate India viewport used when device location is unavailable. */
const INDIA_VIEWPORT = {
  low: { latitude: 6.5, longitude: 68.0 },
  high: { latitude: 35.5, longitude: 97.5 },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

/** Trim Google's address components down to the parts the app names branches with. */
function addressPartsFrom(components) {
  if (!Array.isArray(components)) return {};
  const pick = (type) => {
    const match = components.find(
      (c) => Array.isArray(c?.types) && c.types.includes(type),
    );
    const value =
      (typeof match?.shortText === "string" && match.shortText.trim()) ||
      (typeof match?.longText === "string" && match.longText.trim()) ||
      "";
    return value || undefined;
  };
  const parts = {
    sublocality: pick("sublocality_level_1") || pick("sublocality") || pick("neighborhood"),
    locality: pick("locality") || pick("postal_town"),
    route: pick("route"),
    administrativeArea: pick("administrative_area_level_1"),
  };
  // Drop undefined keys so the JSON payload stays small.
  return Object.fromEntries(Object.entries(parts).filter(([, v]) => v));
}

function parseCoordinate(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
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

  const regionCode =
    typeof body?.regionCode === "string" && /^[A-Za-z]{2}$/.test(body.regionCode.trim())
      ? body.regionCode.trim().toUpperCase()
      : DEFAULT_REGION_CODE;

  const latitude = parseCoordinate(body?.latitude ?? body?.lat);
  const longitude = parseCoordinate(body?.longitude ?? body?.lng);
  const hasLocation =
    latitude != null &&
    longitude != null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;

  const googleBody = {
    textQuery,
    languageCode: "en",
    regionCode,
  };

  if (hasLocation) {
    googleBody.locationBias = {
      circle: {
        center: { latitude, longitude },
        radius: DEFAULT_BIAS_RADIUS_METERS,
      },
    };
  } else {
    // Hard-bound to India when device location is unavailable so results
    // don't drift to the Worker’s European edge location.
    googleBody.locationRestriction = { rectangle: INDIA_VIEWPORT };
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
      body: JSON.stringify(googleBody),
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
      return {
        placeId,
        name,
        address,
        googleMapsUrl,
        addressParts: addressPartsFrom(place?.addressComponents),
      };
    })
    .filter(Boolean);

  return json(results);
}

/**
 * Rating + review count for a single place id, for the guest landing page.
 * Accepts `?placeId=` (cacheable) or a JSON body, and never leaks the key.
 */
async function handlePlaceDetails(request, env) {
  if (!env.GOOGLE_API_KEY) {
    return error(500, "GOOGLE_API_KEY is not configured.", "missing_api_key");
  }

  const url = new URL(request.url);
  let requested = (url.searchParams.get("placeId") || "").trim();
  if (!requested && request.method === "POST") {
    try {
      const body = await request.json();
      requested = typeof body?.placeId === "string" ? body.placeId.trim() : "";
    } catch {
      return error(400, "Request body must be JSON.", "invalid_json");
    }
  }

  const placeId = placeIdFromResource(requested);
  if (!placeId) return error(400, "Missing placeId.", "missing_place_id");

  let googleRes;
  try {
    googleRes = await fetch(`${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_API_KEY,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
      cf: { cacheTtl: DETAILS_CACHE_SECONDS, cacheEverything: true },
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
    if (status === 404) {
      return error(404, googleMessage, "place_not_found");
    }
    if (status === 429) {
      return error(429, "Google Places rate limit exceeded. Try again shortly.", "rate_limited");
    }
    if (status >= 400 && status < 500) {
      return error(400, googleMessage, "google_client_error");
    }
    return error(502, googleMessage, "google_upstream_error");
  }

  return json(
    {
      placeId,
      rating: typeof payload.rating === "number" ? payload.rating : null,
      reviewCount:
        typeof payload.userRatingCount === "number" ? payload.userRatingCount : null,
      googleMapsUrl:
        typeof payload.googleMapsUri === "string" ? payload.googleMapsUri.trim() : "",
    },
    200,
    { "Cache-Control": `public, max-age=${DETAILS_CACHE_SECONDS}` },
  );
}

/** Constant-time-ish compare so a wrong token can't be guessed byte by byte. */
function tokenMatches(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function bearerFrom(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

/**
 * `[{ role, text, files }]` → Gemini `contents`. Anything but "user" is the
 * model's turn. Files ride along as base64 inline data — that is how a photo or
 * PDF of a menu gets read — and are placed before the text, which is what
 * Gemini's prompting guidance recommends for "look at this, then do X".
 */
function toGeminiContents(messages) {
  const contents = [];
  let inlineBytes = 0;

  for (const message of messages) {
    const parts = [];
    const files = Array.isArray(message?.files) ? message.files : [];

    for (const file of files) {
      const mimeType = typeof file?.mimeType === "string" ? file.mimeType.trim() : "";
      const data = typeof file?.data === "string" ? file.data : "";
      if (!mimeType || !data) continue;
      if (!ALLOWED_FILE_TYPES.has(mimeType)) {
        return { error: error(400, `Unsupported file type: ${mimeType}.`, "unsupported_file") };
      }
      // base64 inflates by 4/3; this is the decoded size.
      inlineBytes += Math.floor((data.length * 3) / 4);
      if (inlineBytes > MAX_INLINE_BYTES) {
        return { error: error(413, "Attachments are too large.", "files_too_large") };
      }
      parts.push({ inlineData: { mimeType, data } });
    }

    const text = typeof message?.text === "string" ? message.text : "";
    if (text.trim()) parts.push({ text });
    if (parts.length === 0) continue;

    contents.push({
      role: message?.role === "model" || message?.role === "assistant" ? "model" : "user",
      parts,
    });
  }

  return { contents };
}

function textFromCandidate(candidate) {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

/**
 * Finds the cache holding this prompt's static half, creating it the first time.
 * `key` is a content fingerprint from the app, so an edited menu simply asks for
 * a cache that does not exist yet and gets a fresh one; the stale entry ages out
 * on its own TTL. Returns null whenever caching is unavailable — too small to
 * cache, quota, a bad key — and the caller then sends the prompt inline exactly
 * as it did before caching existed.
 */
async function resolveCachedContent(apiKey, { key, model, system, prefix }) {
  const memo = cacheDirectory.get(key);
  if (memo && memo.expiresAt > Date.now()) return memo.name;
  cacheDirectory.delete(key);

  const headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
  const remember = (name) => {
    // Expire the memo early so a request never picks a cache Google just dropped.
    cacheDirectory.set(key, { name, expiresAt: Date.now() + (CACHE_TTL_SECONDS - 300) * 1000 });
    return name;
  };

  try {
    let pageToken = "";
    for (let page = 0; page < CACHE_LIST_PAGES; page++) {
      const url = `${CACHE_ENDPOINT}?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const body = await res.json();
      const hit = (body?.cachedContents || []).find((entry) => entry?.displayName === key);
      if (hit?.name) return remember(hit.name);
      pageToken = body?.nextPageToken || "";
      if (!pageToken) break;
    }

    const created = await fetch(CACHE_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: `models/${model}`,
        displayName: key,
        ttl: `${CACHE_TTL_SECONDS}s`,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: prefix }] }],
      }),
    });
    if (!created.ok) return null;
    const body = await created.json();
    return body?.name ? remember(body.name) : null;
  } catch {
    return null;
  }
}

async function handleAiGenerate(request, env) {
  const apiKey = env.GEMINI_API_KEY || env.GEMINI_API || env.GOOGLE_API_KEY;
  if (!apiKey) {
    return error(500, "No Gemini API key is configured.", "missing_api_key");
  }
  if (!env.AI_PROXY_TOKEN) {
    return error(500, "AI_PROXY_TOKEN is not configured.", "missing_proxy_token");
  }
  if (!tokenMatches(bearerFrom(request), env.AI_PROXY_TOKEN)) {
    return error(401, "Unauthorized.", "unauthorized");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Request body must be JSON.", "invalid_json");
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const built = toGeminiContents(messages);
  if (built.error) return built.error;
  const contents = built.contents;
  if (contents.length === 0) {
    return error(400, "Missing messages.", "missing_messages");
  }

  const model = typeof body?.model === "string" && body.model.trim()
    ? body.model.trim()
    : DEFAULT_MODEL;
  if (!MODEL_PATTERN.test(model)) {
    return error(400, "Unsupported model.", "unsupported_model");
  }

  const generationConfig = {};
  if (typeof body?.temperature === "number" && Number.isFinite(body.temperature)) {
    generationConfig.temperature = Math.min(2, Math.max(0, body.temperature));
  }
  if (typeof body?.maxOutputTokens === "number" && Number.isFinite(body.maxOutputTokens)) {
    generationConfig.maxOutputTokens = Math.min(
      MAX_OUTPUT_TOKENS_CAP,
      Math.max(1, Math.round(body.maxOutputTokens)),
    );
  }
  const thinkingLevel =
    typeof body?.thinkingLevel === "string" ? body.thinkingLevel.trim().toLowerCase() : "";
  if (thinkingLevel) {
    if (!THINKING_LEVELS.has(thinkingLevel)) {
      return error(400, "Unsupported thinking level.", "unsupported_thinking_level");
    }
    if (THINKING_LEVEL_MODELS.test(model)) {
      generationConfig.thinkingConfig = { thinkingLevel };
    }
  }
  // A response schema makes Gemini return parseable JSON instead of prose, which
  // is how the menu assistant gets dish recommendations back as data.
  const wantsJson = body?.responseSchema && typeof body.responseSchema === "object";
  if (wantsJson) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = body.responseSchema;
  }

  const system = typeof body?.system === "string" && body.system.trim() ? body.system.trim() : "";
  const cacheKey = typeof body?.cache?.key === "string" ? body.cache.key.trim() : "";
  const cachePrefix = typeof body?.cache?.prefix === "string" ? body.cache.prefix : "";
  const cacheName =
    cacheKey && cachePrefix.trim()
      ? await resolveCachedContent(apiKey, { key: cacheKey, model, system, prefix: cachePrefix })
      : null;

  const googleBody = { contents };
  if (Object.keys(generationConfig).length > 0) {
    googleBody.generationConfig = generationConfig;
  }
  if (cacheName) {
    // The caller always sends the static block inline so that a worker without
    // caching still produces a complete prompt. This worker does have the cache,
    // so the duplicate leading copy comes back off — resending it alongside
    // cachedContent would both double the bill and conflict with the cache.
    const first = contents[0];
    if (first?.role === "user" && first.parts?.[0]?.text === cachePrefix) {
      googleBody.contents = contents.slice(1);
    }
    googleBody.cachedContent = cacheName;
  } else if (system) {
    // No cache: the inline copy the caller sent is the whole prompt already.
    googleBody.systemInstruction = { parts: [{ text: system }] };
  }

  let googleRes;
  try {
    googleRes = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(googleBody),
    });
  } catch (err) {
    return error(
      502,
      err instanceof Error ? err.message : "Failed to reach Gemini.",
      "google_network_error",
    );
  }

  let payload = {};
  try {
    payload = await googleRes.json();
  } catch {
    return error(502, "Invalid response from Gemini.", "google_bad_response");
  }

  if (!googleRes.ok) {
    const googleMessage =
      payload?.error?.message || payload?.message || `Gemini error (${googleRes.status}).`;
    const status = googleRes.status;

    if (status === 401 || status === 403) {
      return error(502, googleMessage, "invalid_api_key");
    }
    if (status === 429) {
      return error(429, "Gemini rate limit exceeded. Try again shortly.", "rate_limited");
    }
    if (status >= 400 && status < 500) {
      return error(400, googleMessage, "google_client_error");
    }
    return error(502, googleMessage, "google_upstream_error");
  }

  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const text = textFromCandidate(candidate);

  // A blocked or truncated answer still returns 200 from Google; surface why so
  // the caller can decide between retrying and falling back.
  if (!text) {
    const blockReason = payload?.promptFeedback?.blockReason;
    return error(
      502,
      blockReason ? `Gemini blocked the prompt (${blockReason}).` : "Gemini returned no text.",
      blockReason ? "blocked" : "empty_response",
    );
  }

  const result = {
    text,
    model,
    finishReason: candidate?.finishReason ?? null,
    usage: {
      promptTokens: payload?.usageMetadata?.promptTokenCount ?? null,
      responseTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
      thoughtsTokens: payload?.usageMetadata?.thoughtsTokenCount ?? null,
      cachedTokens: payload?.usageMetadata?.cachedContentTokenCount ?? null,
      totalTokens: payload?.usageMetadata?.totalTokenCount ?? null,
    },
  };

  if (wantsJson) {
    const parsed = tryParseJson(text);
    if (parsed !== undefined) {
      result.data = parsed;
    } else {
      // Gemini 3.5 sometimes returns prose or fenced JSON when a schema is set.
      // Prefer returning the text so the app can recover instead of a hard 502.
      result.data = null;
    }
  }

  return json(result);
}

/** Best-effort JSON parse — bare, fenced, or first {...}/[...] slice. */
function tryParseJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return undefined;
  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) candidates.unshift(fenced[1].trim());
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }
  return undefined;
}

function imageFromCandidate(candidate) {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (!inline) continue;
    const mimeType =
      typeof inline.mimeType === "string"
        ? inline.mimeType
        : typeof inline.mime_type === "string"
          ? inline.mime_type
          : "";
    const data = typeof inline.data === "string" ? inline.data : "";
    if (mimeType.startsWith("image/") && data) {
      return { mimeType, data };
    }
  }
  return null;
}

async function handleAiImage(request, env) {
  const apiKey = env.GEMINI_API_KEY || env.GEMINI_API || env.GOOGLE_API_KEY;
  if (!apiKey) {
    return error(500, "No Gemini API key is configured.", "missing_api_key");
  }
  if (!env.AI_PROXY_TOKEN) {
    return error(500, "AI_PROXY_TOKEN is not configured.", "missing_proxy_token");
  }
  if (!tokenMatches(bearerFrom(request), env.AI_PROXY_TOKEN)) {
    return error(401, "Unauthorized.", "unauthorized");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Request body must be JSON.", "invalid_json");
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return error(400, "Missing prompt.", "missing_prompt");
  if (prompt.length > 2000) {
    return error(400, "Prompt is too long.", "prompt_too_long");
  }

  const requested =
    typeof body?.model === "string" && body.model.trim() ? body.model.trim() : null;
  if (requested && !MODEL_PATTERN.test(requested)) {
    return error(400, "Unsupported model.", "unsupported_model");
  }
  const models = requested ? [requested] : IMAGE_MODELS;

  let lastError = "Image generation failed.";
  for (const model of models) {
    let googleRes;
    try {
      googleRes = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Failed to reach Gemini.";
      continue;
    }

    let payload = {};
    try {
      payload = await googleRes.json();
    } catch {
      lastError = "Invalid response from Gemini.";
      continue;
    }

    if (!googleRes.ok) {
      lastError =
        payload?.error?.message || payload?.message || `Gemini error (${googleRes.status}).`;
      // Auth / quota — don't try the rest of the list.
      if (googleRes.status === 401 || googleRes.status === 403 || googleRes.status === 429) {
        const code =
          googleRes.status === 429
            ? "rate_limited"
            : googleRes.status === 401 || googleRes.status === 403
              ? "invalid_api_key"
              : "google_upstream_error";
        return error(googleRes.status === 429 ? 429 : 502, lastError, code);
      }
      continue;
    }

    const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
    const image = imageFromCandidate(candidate);
    if (image) {
      return json({
        mimeType: image.mimeType,
        data: image.data,
        model,
        usage: {
          promptTokens: payload?.usageMetadata?.promptTokenCount ?? null,
          responseTokens: payload?.usageMetadata?.candidatesTokenCount ?? null,
          thoughtsTokens: payload?.usageMetadata?.thoughtsTokenCount ?? null,
          totalTokens: payload?.usageMetadata?.totalTokenCount ?? null,
        },
      });
    }
    lastError =
      payload?.promptFeedback?.blockReason
        ? `Gemini blocked the prompt (${payload.promptFeedback.blockReason}).`
        : "Gemini returned no image.";
  }

  return error(502, lastError, "empty_response");
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

    if (url.pathname === "/places/details") {
      if (request.method !== "GET" && request.method !== "POST") {
        return error(405, "Method not allowed. Use GET.", "method_not_allowed");
      }
      return handlePlaceDetails(request, env);
    }

    if (url.pathname === "/ai/generate") {
      if (request.method !== "POST") {
        return error(405, "Method not allowed. Use POST.", "method_not_allowed");
      }
      return handleAiGenerate(request, env);
    }

    if (url.pathname === "/ai/image") {
      if (request.method !== "POST") {
        return error(405, "Method not allowed. Use POST.", "method_not_allowed");
      }
      return handleAiImage(request, env);
    }

    return error(404, "Not found.", "not_found");
  },
};
