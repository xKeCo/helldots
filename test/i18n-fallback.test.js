import { describe, it, expect, vi } from "vitest";
import { getStrings } from "../src/i18n.js";
import en from "../src/locales/en.js";

// Simulates the exact shape a stale or brand-new locale would have: a
// dictionary missing keys en.js has. Lives in its own file because vi.mock
// applies per test file and every other i18n test needs the real es.js.
vi.mock("../src/locales/es.js", () => ({
  default: { anonymous: "Anónimo" },
}));

describe("per-key fallback to English", () => {
  it("keeps the keys the locale does translate", () => {
    expect(getStrings("es").anonymous).toBe("Anónimo");
  });

  it("fills keys missing from a locale with the English string", () => {
    // Without the fallback this renders the literal string "undefined" in
    // the UI — a missing translation must degrade to English instead.
    expect(getStrings("es").send).toBe(en.send);
  });

  it("never yields undefined for any key the English dictionary has", () => {
    const strings = getStrings("es");
    for (const key of Object.keys(en)) {
      expect(strings[key], `key: ${key}`).toBeDefined();
    }
  });
});
