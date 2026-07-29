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
 * Substitutes `{n}` in a template string, used for relative time labels and
 * resolution-duration badges (where the substitution is already a string,
 * e.g. "2d 4h" or the "—" fallback).
 * @param {string} template
 * @param {number | string} n
 */
export function formatTemplate(template, n) {
  return template.replace("{n}", String(n));
}

const MINUTE_MS = 60_000;

/**
 * RF5 — human-readable elapsed time ("<1m", "45m", "3h 12m", "2d 4h").
 * Reuses the same {n}-templates the relative timestamps already use.
 * @param {number} ms
 * @param {ReturnType<typeof getStrings>} strings
 * @returns {string} empty string when `ms` isn't a usable duration
 */
export function formatDuration(ms, strings) {
  if (!Number.isFinite(ms) || ms < 0) return "";

  const totalMinutes = Math.floor(ms / MINUTE_MS);
  if (totalMinutes < 1) return strings.durationLessThanMinute;
  if (totalMinutes < 60) {
    return formatTemplate(strings.minutesAgoTemplate, totalMinutes);
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    const hours = formatTemplate(strings.hoursAgoTemplate, totalHours);
    return minutes
      ? `${hours} ${formatTemplate(strings.minutesAgoTemplate, minutes)}`
      : hours;
  }

  const totalDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const days = formatTemplate(strings.daysAgoTemplate, totalDays);
  return hours
    ? `${days} ${formatTemplate(strings.hoursAgoTemplate, hours)}`
    : days;
}
