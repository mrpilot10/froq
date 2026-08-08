import "server-only";

/**
 * Pull a JSON value out of model text that may include markdown fences or
 * leading prose. Gemini 3.5 often ignores responseSchema; freeform JSON still
 * comes back reliably when we ask for it in the prompt.
 */
export function parseJsonFromAiText<T = unknown>(text: string): T | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;

  const candidates = [raw];
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next shape
    }
  }
  return null;
}
