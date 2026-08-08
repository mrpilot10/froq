import { after } from "next/server";
import { resolveMenuPage } from "@/app/menu/actions";
import { answerMenuQuestion } from "@/lib/menu/assistant";
import {
  QUESTION_MAX,
  readChatLang,
  sanitiseHistory,
} from "@/lib/menu/assistant-prompt";
import {
  checkAiReplyGates,
  recordSuccessfulAiReply,
} from "@/lib/menu/ai-replies";
import { recordMenuEvents, type MenuEventInput } from "@/lib/menu/events";

/**
 * Answers a guest's question about the menu they are looking at.
 *
 * Called straight from the menu page's own script, so it is a route handler
 * rather than a server action. Everything it needs comes from the public slug —
 * there is no guest session to trust — which is why it re-reads the live
 * catalogue on each call rather than believing anything in the request body.
 */

export const runtime = "nodejs";

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function withCookie(
  response: Response,
  setCookie: string | undefined,
): Response {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("set-cookie", setCookie);
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

export async function POST(request: Request) {
  let body: {
    slug?: unknown;
    branch?: unknown;
    question?: unknown;
    history?: unknown;
    lang?: unknown;
    cart?: unknown;
    session?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const branch = typeof body.branch === "string" && body.branch ? body.branch : null;
  if (!slug || !question) return json({ ok: false, error: "Bad request." }, 400);
  if (question.length > QUESTION_MAX) {
    return json({ ok: false, error: "That question is a bit long for me." }, 400);
  }

  const cart = Array.isArray(body.cart)
    ? body.cart
        .map((entry) => {
          if (typeof entry === "string") return entry.trim().slice(0, 120);
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { name?: unknown }).name === "string"
          ) {
            return String((entry as { name: string }).name).trim().slice(0, 120);
          }
          return "";
        })
        .filter(Boolean)
        .slice(0, 40)
    : [];

  const resolved = await resolveMenuPage(slug, branch, null);
  if (!resolved.ok) return json({ ok: false, error: "Menu not found." }, 404);
  if (!resolved.page.itemCount) {
    return json({ ok: false, error: "There's no menu published yet." }, 409);
  }

  const sessionKey = typeof body.session === "string" ? body.session : null;
  const gate = await checkAiReplyGates({
    request,
    merchantId: resolved.page.merchantId,
    conversationId: sessionKey,
  });

  if (!gate.ok) {
    return withCookie(
      json(
        { ok: false, error: gate.message },
        gate.status,
        gate.status === 429 ? { "retry-after": "60" } : {},
      ),
      gate.setCookie,
    );
  }

  const lang = readChatLang(body.lang);
  /**
   * Questions are recorded here rather than from the page: what a guest asked
   * is the single most useful thing this menu knows, and a beacon fired from
   * the browser is the one signal a closing tab can lose.
   */
  const track = (events: MenuEventInput[]) => {
    after(() =>
      recordMenuEvents(
        { merchantId: resolved.page.merchantId, branchId: resolved.page.branchId },
        events.map((event) => ({ ...event, lang, sessionKey })),
      ),
    );
  };

  const startedAt = Date.now();
  try {
    const answer = await answerMenuQuestion({
      question,
      businessName: resolved.page.merchant.businessName,
      categories: resolved.page.categories,
      history: sanitiseHistory(body.history),
      lang,
      cart,
      merchantKey: resolved.page.merchant.slug,
      merchantId: resolved.page.merchantId,
      popularity: resolved.page.recentOrders,
      venue: {
        openTime: resolved.page.openTime,
        closeTime: resolved.page.closeTime,
        address: resolved.page.merchant.address ?? null,
        phone: resolved.page.merchant.phone ?? null,
        branchName: resolved.page.merchant.branchName ?? null,
        offers: resolved.page.offers,
        loyalty: resolved.page.loyalty
          ? {
              rewardTitle: resolved.page.loyalty.rewardTitle,
              rewardName: resolved.page.loyalty.rewardName,
              totalStamps: resolved.page.loyalty.totalStamps,
            }
          : null,
      },
    });
    const responseMs = Date.now() - startedAt;

    if (!answer) {
      track([{ event: "chat_asked", detail: question }]);
      return withCookie(
        json({ ok: false, error: "I couldn't work that one out." }, 200),
        gate.setCookie,
      );
    }
    if (!answer.text && !answer.fallback) {
      track([{ event: "chat_asked", detail: question }]);
      return withCookie(
        json({ ok: false, error: "I couldn't work that one out." }, 200),
        gate.setCookie,
      );
    }

    // Meter only after a successful model response (not canned local answers,
    // not failures / timeouts / cancellations handled below).
    if (answer.ai) {
      after(() =>
        recordSuccessfulAiReply({
          merchantId: resolved.page.merchantId,
          guestId: gate.guestId,
          conversationId: gate.conversationId,
          model: answer.ai?.model,
          promptTokens: answer.ai?.promptTokens,
          responseTokens: answer.ai?.responseTokens,
          thoughtsTokens: answer.ai?.thoughtsTokens,
          totalTokens: answer.ai?.totalTokens,
          responseMs,
        }).catch((err) => console.error("ai reply meter failed", err)),
      );
    }

    track([
      { event: "chat_asked", detail: question },
      ...(answer.fallback ? [] : [{ event: "chat_answered" as const, detail: question }]),
    ]);
    return withCookie(
      json({
        ok: true,
        text: answer.text || "",
        recs: answer.recs,
        ...(answer.fallback ? { fallback: true } : {}),
      }),
      gate.setCookie,
    );
  } catch (error) {
    console.error("menu assistant failed", error);
    track([{ event: "chat_asked", detail: question }]);
    return withCookie(
      json({ ok: false, error: "The assistant is unavailable right now." }, 200),
      gate.setCookie,
    );
  }
}
