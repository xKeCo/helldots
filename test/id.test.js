import { describe, it, expect } from "vitest";
import { createId, normalizeActorId } from "../src/id.js";

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

describe("normalizeActorId", () => {
  it("trims the padding a host's template can leave behind", () => {
    expect(normalizeActorId("  u_42\n")).toBe("u_42");
  });

  it("is empty for anything that is not a usable string", () => {
    expect(normalizeActorId(undefined)).toBe("");
    expect(normalizeActorId("   ")).toBe("");
    expect(normalizeActorId(42)).toBe("");
    expect(normalizeActorId({ toString: () => "u_42" })).toBe("");
  });

  it("never truncates, because this is a join key", () => {
    // A clipped display name is ugly; a clipped id is wrong in silence — two
    // ids sharing a prefix would collapse into one person.
    const long = "tenant_" + "x".repeat(200) + "|user_42";
    expect(normalizeActorId(long)).toBe(long);
  });
});
