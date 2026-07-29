import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getStrings, detectLocale, formatTemplate, formatDuration } from "../src/i18n.js";
import en from "../src/locales/en.js";
import es from "../src/locales/es.js";

describe("i18n", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getStrings", () => {
    it("returns the English dictionary by default", () => {
      expect(getStrings()).toBe(en);
      expect(getStrings("en")).toBe(en);
    });

    it("returns the Spanish dictionary for 'es'", () => {
      expect(getStrings("es")).toBe(es);
    });

    it("falls back to English for an unsupported locale code", () => {
      expect(getStrings("fr")).toBe(en);
      expect(getStrings(undefined)).toBe(en);
    });

    it("every key present in en.js is also present in es.js (no missing translations)", () => {
      expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    });
  });

  describe("detectLocale", () => {
    it("picks Spanish when the browser language is es-*", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("es-CO");
      expect(detectLocale()).toBe("es");
    });

    it("falls back to English for unsupported browser languages", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("fr-FR");
      expect(detectLocale()).toBe("en");
    });

    it("falls back to English when navigator.language is empty", () => {
      vi.spyOn(navigator, "language", "get").mockReturnValue("");
      expect(detectLocale()).toBe("en");
    });
  });

  describe("formatTemplate", () => {
    it("substitutes {n} with the given number", () => {
      expect(formatTemplate("{n}m", 5)).toBe("5m");
      expect(formatTemplate("{n} minutes ago", 12)).toBe("12 minutes ago");
    });
  });

  describe("formatDuration", () => {
    const strings = getStrings("en");
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    it("collapses anything under a minute", () => {
      expect(formatDuration(0, strings)).toBe("<1m");
      expect(formatDuration(59_000, strings)).toBe("<1m");
    });

    it("shows bare minutes under an hour", () => {
      expect(formatDuration(45 * MIN, strings)).toBe("45m");
    });

    it("shows hours and minutes under a day", () => {
      expect(formatDuration(3 * HOUR + 12 * MIN, strings)).toBe("3h 12m");
    });

    it("drops the remainder when it is zero", () => {
      expect(formatDuration(3 * HOUR, strings)).toBe("3h");
      expect(formatDuration(2 * DAY, strings)).toBe("2d");
    });

    it("shows days and hours past 24h", () => {
      expect(formatDuration(2 * DAY + 4 * HOUR, strings)).toBe("2d 4h");
    });

    it("returns empty string for invalid input instead of NaN", () => {
      expect(formatDuration(NaN, strings)).toBe("");
      expect(formatDuration(-1000, strings)).toBe("");
      expect(formatDuration(Infinity, strings)).toBe("");
    });

    it("localises through the strings dictionary", () => {
      expect(formatDuration(90 * MIN, getStrings("es"))).toBe("1h 30m");
    });
  });

  it("components.js has no hardcoded, user-visible English UI strings", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components.js"),
      "utf-8"
    );
    // Any capitalized, multi-letter double-quoted string literal that isn't
    // an SVG attribute, an import, or a class/const name is a UI string
    // that should be coming from `strings.*`, not hardcoded here.
    const suspicious = source.match(/"[A-Z][a-zA-Zé][a-zA-Z ]*[.:]?"/g);
    expect(suspicious).toBeNull();
  });
});
