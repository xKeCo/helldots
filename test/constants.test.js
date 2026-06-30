import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CLASSES,
  IDS,
  SELECTORS,
  Z_INDEX,
  CURSOR_SVG,
} from "../src/constants.js";

const srcDir = resolve(process.cwd(), "src");
const sourceText = ["overlay.js", "components.js", "styles.js"]
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
