import "server-only";

/**
 * Gemini access for the app. Every call goes through the froq-apoi Cloudflare
 * Worker (`cloudflare-worker/index.js`), which holds the Google key and adds
 * nothing else — prompts stay here where they are easy to iterate on.
 *
 * Server-only by design: the bearer token must never reach a browser, so guest
 * and merchant screens call a server action or route handler that calls this.
 */

import { parseJsonFromAiText } from "@/lib/ai/parse-json";
import { persistAiUsage } from "@/lib/ai/usage-store";

const DEFAULT_WORKER_URL = "https://froq-apoi.capt-tanmay10.workers.dev";
/** Fast and cheap — the right default for short menu answers. */
/** Current default for new Gemini keys — 2.5 flash is closed to new users. */
export const DEFAULT_AI_MODEL = "gemini-3.5-flash";
/** Past this the guest has given up waiting anyway. */
const REQUEST_TIMEOUT_MS = 20_000;

/** An image or PDF sent inline with the prompt, e.g. a photo of a printed menu. */
export interface AiFile {
  mimeType: string;
  /** Base64 payload without the `data:` prefix. */
  data: string;
}

export interface AiMessage {
  role: "user" | "model";
  text: string;
  files?: AiFile[];
}

export interface AiUsage {
  promptTokens: number | null;
  responseTokens: number | null;
  /** Gemini 3.x hidden reasoning tokens (billed as output). */
  thoughtsTokens: number | null;
  /** Share of `promptTokens` served from a context cache, billed at a tenth. */
  cachedTokens: number | null;
  totalTokens: number | null;
}

export type AiFeature =
  | "menu_chat"
  | "menu_cart_insights"
  | "menu_extract"
  | "menu_translate"
  | "dish_enrich"
  | "dish_image"
  | "other";

/**
 * How much hidden reasoning Gemini may spend before answering. Thoughts are
 * billed as output tokens, and left unset the 3.x default (medium) spends far
 * more on thinking than on the answer itself.
 */
export type AiThinkingLevel = "minimal" | "low" | "medium" | "high";

export interface AiRequest {
  messages: AiMessage[];
  /** Persona and rules. Kept out of the message list so it can't be overwritten. */
  system?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Gemini response schema (OpenAPI subset). When set, the model returns JSON
   * and the parsed value comes back on `data`.
   */
  responseSchema?: Record<string, unknown>;
  /** Reading a whole menu out of a PDF takes far longer than answering a question. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Product feature label for usage logs (never sent to Gemini). */
  feature?: AiFeature;
  /**
   * Who this call is billed to, for the merchant's AI cost panel. Left unset
   * the call is still logged to stdout, just not attributed to a restaurant.
   */
  merchantId?: string | null;
  /** Left unset, Gemini 3.x thinks at `medium` and bills those tokens as output. */
  thinkingLevel?: AiThinkingLevel;
  /**
   * Static head of the prompt to serve from a context cache. `prefix` is sent
   * as the first user turn either way, so a cache miss costs nothing but the
   * usual price. `key` must change whenever `system` or `prefix` changes.
   */
  cache?: { key: string; prefix: string };
}

export interface AiResult<T = unknown> {
  text: string;
  model: string;
  finishReason: string | null;
  usage: AiUsage;
  /** Only set when the request carried a `responseSchema`. */
  data?: T;
}

export class AiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.code = code;
  }
}

function workerEndpoint(): string {
  const base = (process.env.AI_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
  return `${base}/ai/generate`;
}

/**
 * One turn of generation. Throws AiError on anything that isn't a usable
 * answer, including a prompt Gemini refused — callers decide whether to retry,
 * fall back to canned copy, or offer to call a server over.
 */
export async function generateAiText<T = unknown>(request: AiRequest): Promise<AiResult<T>> {
  const token = process.env.AI_WORKER_TOKEN;
  if (!token) {
    throw new AiError("AI_WORKER_TOKEN is not configured.", 500, "missing_token");
  }

  const kept = request.messages.filter(
    (message) => message.text.trim() || (message.files?.length ?? 0) > 0,
  );
  if (kept.length === 0) {
    throw new AiError("No prompt to send.", 400, "missing_messages");
  }

  // The cached block is sent inline as well as by key. A worker that knows about
  // caching drops this copy and bills the cache; one that does not still sees a
  // complete prompt. Caching is then purely a billing optimisation and can never
  // silently strip the menu out from under the assistant.
  const prefix = request.cache?.prefix?.trim() ? request.cache.prefix : "";
  const messages = prefix
    ? [{ role: "user" as const, text: prefix }, ...kept]
    : kept;

  const timeout = AbortSignal.timeout(request.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const signal = request.signal
    ? AbortSignal.any([request.signal, timeout])
    : timeout;

  let response: Response;
  try {
    response = await fetch(workerEndpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messages,
        system: request.system,
        model: request.model ?? DEFAULT_AI_MODEL,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        thinkingLevel: request.thinkingLevel,
        cache: request.cache,
        responseSchema: request.responseSchema,
      }),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new AiError(
      timedOut ? "The assistant took too long to answer." : "Could not reach the assistant.",
      timedOut ? 504 : 0,
      timedOut ? "timeout" : "network_error",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new AiError("Unexpected response from the assistant.", response.status);
  }

  if (!response.ok) {
    const body = payload as { error?: string; code?: string } | null;
    throw new AiError(
      body?.error || "The assistant is unavailable right now.",
      response.status,
      body?.code,
    );
  }

  const body = payload as
    | (Partial<AiResult<T>> & {
        data?: T | null;
        usage?: Partial<AiUsage> | null;
      })
    | null;
  if (!body || typeof body.text !== "string" || !body.text.trim()) {
    throw new AiError("The assistant returned nothing.", 502, "empty_response");
  }

  let data = body.data !== undefined && body.data !== null ? (body.data as T) : undefined;
  if (data === undefined && request.responseSchema) {
    // Worker soft-parse may leave data null; recover from text when possible.
    const recovered = parseJsonFromAiText<T>(body.text);
    if (recovered != null) data = recovered;
  }

  const usage: AiUsage = {
    promptTokens: body.usage?.promptTokens ?? null,
    responseTokens: body.usage?.responseTokens ?? null,
    thoughtsTokens: body.usage?.thoughtsTokens ?? null,
    cachedTokens: body.usage?.cachedTokens ?? null,
    totalTokens: body.usage?.totalTokens ?? null,
  };
  const model = typeof body.model === "string" ? body.model : DEFAULT_AI_MODEL;
  logAiUsage({ kind: "text", feature: request.feature ?? "other", model, usage });
  await persistAiUsage({
    kind: "text",
    feature: request.feature ?? "other",
    model,
    merchantId: request.merchantId,
    usage,
  });

  return {
    text: body.text,
    model,
    finishReason: body.finishReason ?? null,
    usage,
    ...(data !== undefined ? { data } : {}),
  };
}

/** Structured usage line for log drains / future metering. Never includes prompts. */
function logAiUsage(event: {
  kind: "text" | "image";
  feature: AiFeature;
  model: string;
  usage: AiUsage;
}): void {
  const prompt = event.usage.promptTokens;
  const total = event.usage.totalTokens;
  const cached = event.usage.cachedTokens;
  const billedOut =
    prompt != null && total != null && total >= prompt ? total - prompt : null;
  console.info(
    JSON.stringify({
      type: "ai_usage",
      kind: event.kind,
      feature: event.feature,
      model: event.model,
      promptTokens: prompt,
      responseTokens: event.usage.responseTokens,
      thoughtsTokens: event.usage.thoughtsTokens,
      totalTokens: total,
      billedOutputTokens: billedOut,
      cachedTokens: cached,
      // Prompt tokens still charged at full rate — the number caching moves.
      freshPromptTokens: prompt != null && cached != null ? prompt - cached : null,
    }),
  );
}

/** Single-shot prompt — no history, no schema. */
export async function askAi(
  prompt: string,
  options: Omit<AiRequest, "messages"> = {},
): Promise<string> {
  const result = await generateAiText({ ...options, messages: [{ role: "user", text: prompt }] });
  return result.text;
}

export interface AiImageResult {
  mimeType: string;
  /** Base64 without the data: prefix. */
  data: string;
  model: string;
}

/**
 * One food / product image from the worker's `/ai/image` route. Throws AiError
 * when the model returns no image (quota, safety, unsupported key, etc.).
 */
export async function generateAiImage(input: {
  prompt: string;
  model?: string;
  signal?: AbortSignal;
  feature?: AiFeature;
  merchantId?: string | null;
}): Promise<AiImageResult> {
  const token = process.env.AI_WORKER_TOKEN;
  if (!token) {
    throw new AiError("AI_WORKER_TOKEN is not configured.", 500, "missing_token");
  }
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new AiError("No image prompt to send.", 400, "missing_prompt");
  }

  const base = (process.env.AI_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
  const timeout = AbortSignal.timeout(45_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${base}/ai/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt,
        model: input.model,
      }),
      signal,
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new AiError(
      timedOut ? "Image generation took too long." : "Could not reach the image service.",
      timedOut ? 504 : 0,
      timedOut ? "timeout" : "network_error",
    );
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new AiError("Unexpected response from the image service.", response.status);
  }

  if (!response.ok) {
    const body = payload as { error?: string; code?: string } | null;
    throw new AiError(
      body?.error || "Image generation is unavailable right now.",
      response.status,
      body?.code,
    );
  }

  const body = payload as (Partial<AiImageResult> & { usage?: AiUsage }) | null;
  if (
    !body ||
    typeof body.data !== "string" ||
    !body.data ||
    typeof body.mimeType !== "string" ||
    !body.mimeType.startsWith("image/")
  ) {
    throw new AiError("The image service returned nothing.", 502, "empty_response");
  }

  const model = typeof body.model === "string" ? body.model : "image";
  const feature = input.feature ?? "dish_image";
  const usage: AiUsage = {
    promptTokens: body.usage?.promptTokens ?? null,
    responseTokens: body.usage?.responseTokens ?? null,
    thoughtsTokens: body.usage?.thoughtsTokens ?? null,
    cachedTokens: body.usage?.cachedTokens ?? null,
    totalTokens: body.usage?.totalTokens ?? null,
  };
  logAiUsage({ kind: "image", feature, model, usage });
  await persistAiUsage({
    kind: "image",
    feature,
    model,
    merchantId: input.merchantId,
    usage,
  });

  return {
    mimeType: body.mimeType,
    data: body.data,
    model,
  };
}
