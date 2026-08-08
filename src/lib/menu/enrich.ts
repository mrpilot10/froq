import "server-only";

import sharp from "sharp";
import { generateAiImage, generateAiText } from "@/lib/ai/gemini";
import { parseJsonFromAiText } from "@/lib/ai/parse-json";
import {
  ALLERGENS,
  fitMenuDescription,
  isAllergen,
  MENU_DESC_MAX,
  type Allergen,
} from "./types";

/** Square JPEG ceiling for dish cards — keeps server-action responses small. */
const THUMB_SIZE = 512;
const THUMB_QUALITY = 78;

export interface DishEnrichment {
  description: string;
  /** Typical cook / prep minutes, or null when unknown. */
  prepMinutes: number | null;
  /** 0–3 heat to match SPICE_LABELS, or null when the dish gives no clue. */
  spiceLevel: number | null;
  /** Approximate kcal for one serving, or null when the dish gives no clue. */
  calories: number | null;
  /** High-confidence contains-tags from the name/notes — prefer under-tagging. */
  allergens: Allergen[];
}

/**
 * Guest-facing dish copy, plus cook-time, heat, calories and allergen tags. The model is
 * held to what the dish name actually tells it: a guest who orders on the
 * strength of a texture or a cooking method we made up is a guest the kitchen
 * has to apologise to, so the copy stays short and claims little.
 *
 * Uses freeform JSON (not responseSchema) — Gemini 3.5 currently returns
 * empty/malformed payloads when a schema is forced.
 */
export async function generateDishDescription(input: {
  name: string;
  section?: string;
  existing?: string;
  /** Whose AI bill this lands on. */
  merchantId?: string | null;
}): Promise<DishEnrichment> {
  const name = input.name.trim();
  if (!name) {
    return {
      description: "",
      prepMinutes: null,
      spiceLevel: null,
      calories: null,
      allergens: [],
    };
  }

  const allergenList = ALLERGENS.join("|");
  const result = await generateAiText({
    feature: "dish_enrich",
    merchantId: input.merchantId,
    system: `You write restaurant menu descriptions for Indian diners.
Rules:
- Reply with ONLY a JSON object: {"description":"...","prepMinutes":25,"spiceLevel":2,"calories":450,"allergens":["dairy","gluten"]}
- description: write a concise, accurate menu description in 20–35 words (maximum ${MENU_DESC_MAX} characters). Describe only what is certain from the dish name or provided ingredients. Do not invent preparation methods, textures, serving style, or quality claims. Use simple, appetising language.
- Never invent prices or sides that aren't implied by the dish name.
- prepMinutes: a realistic total cook/prep time in minutes for a restaurant kitchen (5–180), or null if you truly can't tell.
- spiceLevel: how hot the dish is as served in an Indian restaurant — 0 = not spicy at all (desserts, plain breads, lassi), 1 = mild, 2 = medium, 3 = hot (vindaloo, chilli chicken, Andhra style). Use null only if the name gives no clue at all.
- calories: approximate kcal in ONE restaurant serving as usually cooked in India, counting the ghee, cream, oil and sugar a kitchen actually uses (20–3000). A roti is roughly 120, a plain dosa 170, a butter chicken portion 700, a plate of biryani 800, a gulab jamun 300. Round to the nearest 10. Use null only if the name gives no clue at all.
- allergens: array of contains-tags from this set only: ${allergenList}. Tag only when the dish name or notes make it highly likely the dish contains that allergen as usually cooked in an Indian restaurant (e.g. paneer/butter/cream/ghee/lassi → dairy; naan/roti/paratha/bread/pasta → gluten; peanut/cashew/almond/pistachio/"nuts" → nuts; egg → egg; prawn/shrimp/crab/lobster → shellfish; fish/pomfret/rohu → fish; tofu/soy sauce → soy). Prefer an empty array over a guess. Never claim a dish is free of an allergen.
- No markdown fences, no emoji, no prose outside the JSON.`,
    messages: [
      {
        role: "user",
        text: [
          `Dish: ${name}`,
          input.section ? `Category: ${input.section}` : null,
          input.existing?.trim()
            ? `Existing notes to refine: ${input.existing.trim()}`
            : null,
          // Restating the hard part next to the dish keeps the model honest;
          // left only in the system turn it drifts back into "perfectly
          // crispy" and "ideal for sharing".
          "State only what the name and any notes establish. No claims about texture, doneness, how it is served, or how good it is.",
          `Return JSON: {"description":"...","prepMinutes":number|null,"spiceLevel":0|1|2|3|null,"calories":number|null,"allergens":[${allergenList}]?}`,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    // Low: this is a factual restatement, and warmth here reads as invention.
    temperature: 0.25,
    // A restatement of the dish name needs no deliberation.
    thinkingLevel: "minimal",
    // Gemini 3.5 spends a large share of the budget on hidden "thinking"
    // tokens — 480 truncates the JSON mid-string.
    maxOutputTokens: 2_048,
    timeoutMs: 45_000,
  });

  const parsed = parseJsonFromAiText<{
    description?: string;
    prepMinutes?: number | null;
    spiceLevel?: number | null;
    calories?: number | null;
    allergens?: unknown;
  }>(result.text);

  const description = fitMenuDescription(parsed?.description ?? "");

  const rawPrep = parsed?.prepMinutes;
  const prep =
    typeof rawPrep === "number" && Number.isFinite(rawPrep)
      ? Math.round(rawPrep)
      : null;

  const rawSpice = parsed?.spiceLevel;
  const spice =
    typeof rawSpice === "number" && Number.isFinite(rawSpice)
      ? Math.round(rawSpice)
      : null;

  // Rounded to 10 whatever the model returns: a dish card claiming 437 kcal
  // reads as a measurement, and this is an estimate from a dish name.
  const rawCalories = parsed?.calories;
  const calories =
    typeof rawCalories === "number" && Number.isFinite(rawCalories)
      ? Math.round(rawCalories / 10) * 10
      : null;

  const allergens = Array.isArray(parsed?.allergens)
    ? [
        ...new Set(
          parsed.allergens
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim().toLowerCase())
            .filter(isAllergen),
        ),
      ]
    : [];

  return {
    description,
    prepMinutes: prep != null && prep >= 5 && prep <= 180 ? prep : null,
    spiceLevel: spice != null && spice >= 0 && spice <= 3 ? spice : null,
    calories: calories != null && calories >= 20 && calories <= 3000 ? calories : null,
    allergens,
  };
}

/** Square food photo for a dish card — AI Studio / Gemini image models. */
export async function generateDishThumbnail(input: {
  name: string;
  description?: string;
  /** Whose AI bill this lands on. */
  merchantId?: string | null;
}): Promise<{ mimeType: string; data: string; dataUrl: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the dish a name first.");

  const prompt = [
    "Create a square, appetising restaurant-menu food photograph.",
    `Dish: ${name}.`,
    input.description?.trim() ? `About the dish: ${input.description.trim().slice(0, 220)}.` : null,
    "Natural lighting, shallow depth of field, plated simply on a clean ceramic plate.",
    "No text, logos, watermarks, or hands in the frame. Photorealistic.",
  ]
    .filter(Boolean)
    .join(" ");

  const image = await generateAiImage({
    prompt,
    feature: "dish_image",
    merchantId: input.merchantId,
  });
  const raw = Buffer.from(image.data, "base64");
  const jpeg = await sharp(raw)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "centre" })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();
  const data = jpeg.toString("base64");
  return {
    mimeType: "image/jpeg",
    data,
    dataUrl: `data:image/jpeg;base64,${data}`,
  };
}
