import en from "./locales/en.js";
import es from "./locales/es.js";

const LOCALES = { en, es };
const DEFAULT_LOCALE = "en";

/**
 * Picks a supported locale code from the browser's language, falling back
 * to English for anything HellDots doesn't ship a translation for.
 * @returns {"en" | "es"}
 */
export function detectLocale() {
  const lang = (navigator.language || DEFAULT_LOCALE).slice(0, 2).toLowerCase();
  return lang in LOCALES ? /** @type {"en" | "es"} */ (lang) : DEFAULT_LOCALE;
}

/**
 * Resolves the UI strings dictionary for a given locale code, falling back
 * to English if the code isn't one HellDots ships.
 * @param {string} [localeCode]
 * @returns {typeof en}
 */
export function getStrings(localeCode) {
  return LOCALES[localeCode] || LOCALES[DEFAULT_LOCALE];
}

/**
 * Substitutes `{n}` in a template string, used for relative time labels.
 * @param {string} template
 * @param {number} n
 */
export function formatTemplate(template, n) {
  return template.replace("{n}", String(n));
}
