import { describe, it, expect, afterEach } from "vitest";
import { getShadowRoot, TAG_NAME } from "../src/root-element.js";

describe("root-element", () => {
  afterEach(() => {
    document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
  });

  it("creates and mounts a single shadow host on first call", () => {
    const root = getShadowRoot();
    expect(root).toBeTruthy();
    expect(root.host.tagName.toLowerCase()).toBe(TAG_NAME);
    expect(document.body.contains(root.host)).toBe(true);
  });

  it("reuses the existing host on subsequent calls", () => {
    const first = getShadowRoot();
    const second = getShadowRoot();
    expect(second).toBe(first);
    expect(document.querySelectorAll(TAG_NAME).length).toBe(1);
  });

  it("is safe to register the custom element more than once across modules", () => {
    expect(() => {
      getShadowRoot();
      getShadowRoot();
    }).not.toThrow();
  });
});
