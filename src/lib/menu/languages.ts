import catalogue from "./languages.json";

export interface MenuLanguage {
  code: string;
  /** Endonym, i.e. what a speaker of the language calls it. */
  native: string;
  /** English name, used when telling the model what to translate into. */
  name: string;
  rtl?: boolean;
}

export const MENU_LANGUAGES: readonly MenuLanguage[] = catalogue.languages;

export const MENU_LANG_CODES: readonly string[] = MENU_LANGUAGES.map((l) => l.code);

/** Everything except English — the set a menu actually needs translating into. */
export const TRANSLATABLE_LANGS: readonly MenuLanguage[] = MENU_LANGUAGES.filter(
  (lang) => lang.code !== "EN",
);

const BY_CODE = new Map(MENU_LANGUAGES.map((lang) => [lang.code, lang]));

export function findLanguage(code: unknown): MenuLanguage | null {
  const raw = typeof code === "string" ? code.trim().toUpperCase() : "";
  return BY_CODE.get(raw) ?? null;
}

/** Anything unrecognised falls back to English rather than erroring. */
export function readLanguage(code: unknown): string {
  return findLanguage(code)?.code ?? "EN";
}

export function isRtl(code: unknown): boolean {
  return findLanguage(code)?.rtl === true;
}
