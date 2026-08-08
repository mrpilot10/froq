/**
 * Turns assistant prose into guest-friendly copy: ₹ with digits, and **bold**
 * markers around dish names / prices for the chat bubble.
 */

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function parseWordNumber(phrase: string): number | null {
  const words = phrase
    .toLowerCase()
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((w) => w && w !== "and");
  if (!words.length) return null;

  let total = 0;
  let current = 0;
  for (const word of words) {
    if (word in ONES) {
      current += ONES[word];
    } else if (word in TENS) {
      current += TENS[word];
    } else if (word === "hundred") {
      current = (current || 1) * 100;
    } else if (word === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else {
      return null;
    }
  }
  total += current;
  return total > 0 ? total : null;
}

const NUMBER_WORD =
  "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and";

/** "fifty rupees" / "Rs 120" / "INR 80" → ₹50 / ₹120 / ₹80 */
export function normalizeRupeeAmounts(text: string): string {
  let out = text;

  out = out.replace(
    /\b(?:rs\.?|inr|₹)\s*([0-9]{1,5})\b/gi,
    (_m, n: string) => `₹${Number(n)}`,
  );
  out = out.replace(/\b([0-9]{1,5})\s*(?:rupees?|rs\.?)\b/gi, (_m, n: string) => `₹${Number(n)}`);

  const wordAmount = new RegExp(
    `\\b((?:(?:${NUMBER_WORD})[\\s-]+)*(?:${NUMBER_WORD}))\\s+rupees?\\b`,
    "gi",
  );
  out = out.replace(wordAmount, (match, words: string) => {
    const value = parseWordNumber(words);
    return value != null ? `₹${value}` : match;
  });

  return out;
}

/** Anything the model might reach for to open a list line. */
const LIST_MARKER = /^(?:[-*\u2022\u2013\u2014]|\d+[.)])[ \t]+/;

/**
 * Keeps a long answer scannable in a phone-width bubble: one marker for list
 * lines, no stray indentation, and at most one blank line between paragraphs.
 * Runs before dash softening so a line that opens with "- " is read as a
 * bullet rather than a pause.
 */
export function tidyLayout(text: string): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      return trimmed ? trimmed.replace(LIST_MARKER, "\u2022 ") : "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A dash reads as a machine drawing breath. Good floor staff use a comma or a
 * fresh sentence, so any dash standing alone between words becomes one. Dashes
 * inside a word are left alone: "gluten-free" and "Peri-Peri" are spellings,
 * not pauses.
 */
export function softenDashes(text: string): string {
  // "fresh — and quick" wants no comma at all; anything else reads as a pause.
  // Only spaces are eaten, never newlines: a line break is layout, not a pause.
  const beforeJoin = /(?=(?:and|or|but|so|then|plus|yet)\b)/.source;
  let out = (text ?? "")
    .replace(new RegExp(`[ \\t]*[\\u2014\\u2013]+[ \\t]*${beforeJoin}`, "gi"), " ")
    .replace(/[ \t]*[\u2014\u2013]+[ \t]*/g, ", ");
  out = out
    .replace(new RegExp(`[ \\t]-+[ \\t]*${beforeJoin}`, "gi"), " ")
    .replace(/([ \t])-+([ \t])/g, ", ");
  // A dash that already followed punctuation leaves a doubled comma behind.
  out = out.replace(/([,;:])\s*,/g, "$1");
  out = out.replace(/([.!?])\s*,\s*/g, "$1 ");
  out = out.replace(/\s+([,.!?])/g, "$1");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Wraps known dish names and ₹amounts in **…** for the chat renderer.
 * Longer dish names win so "Veg Masala Cheese Grill (Jumbo)" beats "Grill".
 */
export function markAssistantEmphasis(text: string, dishNames: string[]): string {
  let out = normalizeRupeeAmounts(text);

  // Don't double-wrap.
  out = out.replace(/\*\*/g, "");

  const names = [...new Set(dishNames.map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );

  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "gi");
    out = out.replace(re, (match, _g, offset: number, source: string) => {
      if (source.slice(offset - 2, offset) === "**") return match;
      if (source.slice(offset + match.length, offset + match.length + 2) === "**") {
        return match;
      }
      const before = offset > 0 ? source[offset - 1] : "";
      const after = source[offset + match.length] ?? "";
      if (before && /[\w*]/.test(before)) return match;
      if (after && /[\w*]/.test(after)) return match;
      return `**${match}**`;
    });
  }

  out = out.replace(/₹[0-9]{1,5}/g, (match, offset: number, source: string) => {
    if (source.slice(offset - 2, offset) === "**") return match;
    return `**${match}**`;
  });
  return out;
}

export type MessagePart = { text: string; bold: boolean; plain: boolean };

/** Split `**bold**` markers into SoftUI-friendly parts. */
export function splitEmphasisParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      const chunk = text.slice(last, match.index);
      if (chunk) parts.push({ text: chunk, bold: false, plain: true });
    }
    parts.push({ text: match[1], bold: true, plain: false });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), bold: false, plain: true });
  }
  if (!parts.length && text) parts.push({ text, bold: false, plain: true });
  return parts;
}

export function formatAssistantMessage(
  text: string,
  dishNames: string[],
): { text: string; parts: MessagePart[] } {
  const marked = markAssistantEmphasis(softenDashes(tidyLayout(text)), dishNames);
  return { text: marked.replace(/\*\*/g, ""), parts: splitEmphasisParts(marked) };
}
