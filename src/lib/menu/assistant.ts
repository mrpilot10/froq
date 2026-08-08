import "server-only";

import { createHash } from "node:crypto";
import { generateAiText } from "@/lib/ai/gemini";
import { parseJsonFromAiText } from "@/lib/ai/parse-json";
import {
  liftDishBullets,
  menuBrief,
  mergeLiftedDishes,
  needsStaffHandoff,
  pickRecommendations,
  popularityBrief,
  prepWaitAnswer,
  QUESTION_MAX,
  readAnswerText,
  systemPrompt,
  WAIT_ASK,
  type AssistantAnswer,
  type ChatLang,
  venueBrief,
  type ChatTurn,
  type PopularityHint,
  type VenueFacts,
} from "@/lib/menu/assistant-prompt";
import { formatAssistantMessage } from "@/lib/menu/format-assistant-text";
import type { MenuCategory } from "@/lib/menu/types";

/**
 * The guest-facing menu assistant. Guests ask things like "something spicy but
 * not too heavy" or "what's good for two under ₹800", and Gemini answers from
 * this merchant's catalogue only. The rules it works under, and the check on
 * what it names, live in `assistant-prompt.ts`.
 */

/**
 * The answer itself is two or three sentences, but this model spends most of
 * its budget on hidden reasoning tokens — a tight ceiling gets the reply cut
 * off mid-JSON rather than making it shorter. At 2,560 the multi-constraint
 * asks ("veg options under 300", "feed 4 people under 1500") stopped on
 * MAX_TOKENS partway through the JSON, so the guest got the "I couldn't work
 * that one out" bubble instead of the answer the model had already reasoned
 * out. Every one of those completes inside 4,096.
 */
const ANSWER_TOKENS = 4_096;

const ALLERGEN_ASK =
  /\b(allergen|allerg(y|ies)|nut|peanut|tree\s*nut|dairy|gluten|shellfish|egg|fish)\b/i;

function menuHasAllergenTags(categories: MenuCategory[]): boolean {
  return categories.some((category) =>
    category.items.some((item) => item.allergens.length > 0),
  );
}

/**
 * No allergen tags to quote. Ask the guest to check with the kitchen in person.
 */
function untaggedAllergenAnswer(): AssistantAnswer {
  return {
    text: "I don't have allergen tags for that on this menu. Please check with the kitchen before ordering.",
    recs: [],
  };
}

/**
 * Names the cache holding this restaurant's rules and menu. The merchant and
 * language are readable so a cache can be traced back to a shop, and the digest
 * covers the exact bytes being cached: rename a dish, change a price, or take
 * one off the menu and the key stops matching, so the next question builds a
 * fresh cache instead of quoting a menu the kitchen no longer cooks.
 */
function menuCacheKey(input: {
  merchantKey: string;
  lang: ChatLang;
  system: string;
  prefix: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.system}\u0000${input.prefix}`)
    .digest("hex")
    .slice(0, 16);
  const merchant = input.merchantKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "menu";
  return `froq:${merchant}:${input.lang}:${digest}`;
}

export async function answerMenuQuestion(input: {
  question: string;
  businessName: string;
  categories: MenuCategory[];
  /** Earlier turns of this chat, oldest first, already sanitised. */
  history?: ChatTurn[];
  lang?: ChatLang;
  /**
   * Dish names currently in the guest cart (English / menu catalogue spelling).
   * Used only for wait-time estimates.
   */
  cart?: readonly string[] | null;
  /** Recent order counts for popular / best-seller asks. */
  popularity?: PopularityHint | null;
  /** Hours, address, offers, loyalty — everything the page already shows. */
  venue?: VenueFacts | null;
  /** Merchant slug, so one shop's cached menu is never read for another. */
  merchantKey?: string;
  /** Merchant row id, so the call lands on the right restaurant's AI bill. */
  merchantId?: string | null;
  signal?: AbortSignal;
}): Promise<AssistantAnswer | null> {
  const question = input.question.trim().slice(0, QUESTION_MAX);
  if (!question) return null;

  // Prefer a clear local answer over a model hedging when we have nothing tagged.
  if (ALLERGEN_ASK.test(question) && !menuHasAllergenTags(input.categories)) {
    return untaggedAllergenAnswer();
  }

  // Wait time is arithmetic on cook-time tags, not something to invent.
  if (WAIT_ASK.test(question)) {
    const wait = prepWaitAnswer(input.categories, input.cart ?? []);
    if (wait) return { text: wait.text, recs: [] };
  }

  // The menu rides on the newest turn only — replaying it beside every earlier
  // line would crowd the window without telling the model anything new.
  const history = (input.history ?? []).map((turn) => ({
    role: turn.role,
    text: turn.text,
  }));

  // The catalogue is the same for every guest in the room, so it is cached and
  // referenced rather than re-uploaded per question. What actually varies —
  // what is selling tonight, and the question itself — stays on the live turn.
  const lang = input.lang ?? "EN";
  const system = systemPrompt(input.businessName, { lang });
  const venue = input.venue ? venueBrief(input.venue) : "";
  const cachedPrefix = [`Menu:\n\n${menuBrief(input.categories)}`, venue]
    .filter(Boolean)
    .join("\n\n");
  const popular = popularityBrief(input.categories, input.popularity);

  const result = await generateAiText({
    feature: "menu_chat",
    merchantId: input.merchantId,
    system,
    cache: {
      key: menuCacheKey({
        merchantKey: input.merchantKey ?? input.businessName,
        lang,
        system,
        prefix: cachedPrefix,
      }),
      prefix: cachedPrefix,
    },
    messages: [
      ...history,
      {
        role: "user" as const,
        text: popular
          ? `${popular}\n\nGuest asks: ${question}`
          : `Guest asks: ${question}`,
      },
    ],
    temperature: 0.55,
    // Answering from a catalogue we hand over is recall, not reasoning.
    thinkingLevel: "minimal",
    maxOutputTokens: ANSWER_TOKENS,
    signal: input.signal,
  });

  const parsed = parseJsonFromAiText<{ answer?: unknown; dishes?: unknown }>(result.text);
  const answer = readAnswerText(parsed?.answer, result.text);
  if (!answer) return null;

  const picked = pickRecommendations(parsed?.dishes, input.categories);
  const menuNames = input.categories.flatMap((category) =>
    category.items.map((item) => item.name),
  );
  const dishNames = [...picked.map(([name]) => name), ...menuNames];
  // Keep **markers** in `text` so the guest page can stream + bold as it types.
  const { parts } = formatAssistantMessage(answer, dishNames);
  const marked = parts.map((part) => (part.bold ? `**${part.text}**` : part.text)).join("");

  // A dish written as a bullet is a dish the guest cannot tap. Lift those into
  // cards and drop the lines, so a recommendation always arrives as something
  // orderable rather than as a paragraph about something orderable.
  const lifted = liftDishBullets(marked, input.categories);
  const recs = mergeLiftedDishes(picked, lifted.dishes, input.categories);
  const text = lifted.dishes.length ? lifted.text : marked;

  const handoff = needsStaffHandoff(answer) || needsStaffHandoff(text);
  return {
    text,
    recs: handoff ? [] : recs,
    ...(handoff ? { fallback: true as const } : {}),
    ai: {
      model: result.model,
      promptTokens: result.usage.promptTokens,
      responseTokens: result.usage.responseTokens,
      thoughtsTokens: result.usage.thoughtsTokens,
      totalTokens: result.usage.totalTokens,
    },
  };
}
