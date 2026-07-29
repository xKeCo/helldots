import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getStrings, detectLocale, formatTemplate } from "../src/i18n.js";
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

describe("locale parity", () => {
  it("ships the same keys in both locales", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });
});
