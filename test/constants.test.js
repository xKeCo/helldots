import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLASSES,
  IDS,
  SELECTORS,
  Z_INDEX,
  CURSOR_SVG,
  COMMENT_TYPES,
  TYPE_COLORS,
  PRIORITIES,
  PRIORITY_COLORS,
} from "../src/constants.js";

const srcDir = resolve(process.cwd(), "src");
// Every .js file in src/ except constants.js itself — a hardcoded subset
// would silently stop covering new modules (see git history: inbox.js was
// missing from this list for a full task before anyone noticed).
const sourceText = readdirSync(srcDir)
  .filter((file) => file.endsWith(".js") && file !== "constants.js")
  .map((file) => readFileSync(resolve(srcDir, file), "utf-8"))
  .join("\n");

describe("constants", () => {
  it("exports unique, non-empty class names", () => {
    const values = Object.values(CLASSES);
    expect(values.length).toBeGreaterThan(0);
    values.forEach((v) => {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    });
    expect(new Set(values).size).toBe(values.length);
  });

  it("exports unique, non-empty element ids", () => {
    const values = Object.values(IDS);
    expect(values.length).toBeGreaterThan(0);
    values.forEach((v) => expect(typeof v).toBe("string"));
    expect(new Set(values).size).toBe(values.length);
  });

  it("class names and ids never collide with each other", () => {
    const classValues = new Set(Object.values(CLASSES));
    const idValues = Object.values(IDS);
    idValues.forEach((id) => expect(classValues.has(id)).toBe(false));
  });

  it("exports a usable CSS container selector", () => {
    expect(typeof SELECTORS.CONTAINER).toBe("string");
    expect(() => document.querySelectorAll(SELECTORS.CONTAINER)).not.toThrow();
  });

  it("exports numeric, distinct z-index layers", () => {
    const values = Object.values(Z_INDEX);
    values.forEach((v) => expect(typeof v).toBe("number"));
    expect(new Set(values).size).toBe(values.length);
  });

  it("exports a data: URI for the custom cursor", () => {
    expect(CURSOR_SVG.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("has no dead constants: every CLASSES/IDS key is referenced from src/", () => {
    Object.keys(CLASSES).forEach((key) => {
      expect(sourceText.includes(`CLASSES.${key}`)).toBe(true);
    });
    Object.keys(IDS).forEach((key) => {
      expect(sourceText.includes(`IDS.${key}`)).toBe(true);
    });
  });
});

describe("classification constants", () => {
  it("exposes the four RF3 types in picker order", () => {
    expect(COMMENT_TYPES).toEqual([
      "bug",
      "suggestion",
      "question",
      "improvement",
    ]);
  });

  it("keeps the comment cursor within the 32x32 limit browsers enforce", () => {
    // Chromium refuses to paint a custom cursor larger than 32x32 DIP once it
    // can intersect native UI — which is what happens as the pointer nears
    // the page edges. A larger image silently reverts to the default arrow
    // there, so the size is a correctness constraint, not a style choice.
    // https://chromestatus.com/feature/5825971391299584
    const width = Number(CURSOR_SVG.match(/width="(\d+)"/)[1]);
    const height = Number(CURSOR_SVG.match(/height="(\d+)"/)[1]);
    expect(width).toBeLessThanOrEqual(32);
    expect(height).toBeLessThanOrEqual(32);
  });

  it("exposes priorities ordered high to low", () => {
    expect(PRIORITIES).toEqual(["high", "medium", "low"]);
  });

  it("has a colour for every type and priority", () => {
    for (const type of COMMENT_TYPES) {
      expect(TYPE_COLORS[type]).toMatch(/^#[0-9A-F]{6}$/i);
    }
    for (const priority of PRIORITIES) {
      expect(PRIORITY_COLORS[priority]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
