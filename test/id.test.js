import { describe, it, expect } from "vitest";
import { createId } from "../src/id.js";

describe("createId", () => {
  it("never repeats across a tight synchronous burst", () => {
    // The regression this module exists for: ids used to be `Date.now()`,
    // so everything created inside one millisecond shared an id. A loop
    // this tight is exactly what a programmatic import looks like.
    const ids = new Set();
    for (let i = 0; i < 10000; i++) ids.add(createId());
    expect(ids.size).toBe(10000);
  });

  it("stays URL-safe so it can travel in ?helldotsComment=", () => {
    for (let i = 0; i < 200; i++) {
      const id = createId();
      expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/);
      expect(encodeURIComponent(id)).toBe(id);
    }
  });

  it("returns a string, so hosts round-tripping through JSON keep the id", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    expect(JSON.parse(JSON.stringify({ id })).id).toBe(id);
  });
});
