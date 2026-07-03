import { describe, it, expect, afterEach, vi } from "vitest";
import {
  readStoredComments,
  writeStoredComments,
  mergeForStorage,
  STORAGE_KEY,
} from "../src/storage.js";

const comment = (id, page, text = `comment ${id}`) => ({
  id,
  text,
  anchor: null,
  page,
  replies: [],
  author: "Test",
  createdAt: "2026-07-03T00:00:00.000Z",
  screenshots: [],
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("readStoredComments", () => {
  it("returns [] when the key is missing", () => {
    expect(readStoredComments()).toEqual([]);
  });

  it("returns [] on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readStoredComments()).toEqual([]);
  });

  it("returns [] when the stored value is not an array", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nope: true }));
    expect(readStoredComments()).toEqual([]);
  });

  it("returns [] and does not throw when localStorage access throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStoredComments()).toEqual([]);
  });

  it("round-trips what writeStoredComments wrote", () => {
    const data = [comment(1, "/"), comment(2, "/pricing")];
    writeStoredComments(data);
    expect(readStoredComments()).toEqual(data);
  });
});

describe("writeStoredComments", () => {
  it("warns and survives a quota error", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeStoredComments([comment(1, "/")])).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});

describe("mergeForStorage", () => {
  it("keeps stored entries from other pages", () => {
    const stored = [comment(1, "/other")];
    const merged = mergeForStorage(stored, [comment(2, "/")], "/");
    expect(merged.map((c) => c.id).sort()).toEqual([1, 2]);
  });

  it("drops same-page stored entries missing from memory (deleted)", () => {
    const stored = [comment(1, "/"), comment(2, "/other")];
    const merged = mergeForStorage(stored, [], "/");
    expect(merged.map((c) => c.id)).toEqual([2]);
  });

  it("replaces same-page entries by id with the in-memory version", () => {
    const stored = [comment(1, "/", "old text")];
    const merged = mergeForStorage(stored, [comment(1, "/", "new text")], "/");
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("new text");
  });

  it("replaces an other-page stored entry when memory holds the same id", () => {
    // e.g. the comment was loaded as inactive and then deleted → memory wins
    const stored = [comment(7, "/other", "stale")];
    const merged = mergeForStorage(
      stored,
      [comment(7, "/other", "fresh")],
      "/"
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("fresh");
  });
});
