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
  it("returns true on a normal successful write", () => {
    expect(writeStoredComments([comment(1, "/")])).toBe(true);
  });

  it("warns, returns false and survives a quota error with nothing to shed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    // No contextScreenshot on this comment — nothing sheddable, so the
    // write must still fail, but never throw.
    let result;
    expect(() => {
      result = writeStoredComments([comment(1, "/")]);
    }).not.toThrow();
    expect(result).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("under quota pressure, sheds the oldest automatic contextScreenshots first — retrying until it fits — while keeping comment text and user-attached screenshots[] intact", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const withShot = (id, createdAt, extra = {}) => ({
      id,
      text: `comment ${id}`,
      anchor: null,
      page: "/",
      replies: [],
      author: "Test",
      createdAt,
      screenshots: extra.screenshots || [],
      contextScreenshot: "data:image/jpeg;base64,auto" + id,
      status: "open",
    });

    const comments = [
      // Newest first in array order, to prove sorting is by createdAt and
      // not by position.
      withShot(3, "2026-01-03T00:00:00.000Z"),
      withShot(1, "2026-01-01T00:00:00.000Z"), // oldest — shed 1st
      withShot(2, "2026-01-02T00:00:00.000Z", {
        screenshots: ["data:image/png;base64,user-attached"],
      }), // shed 2nd
    ];

    // The mock quota only tolerates a payload with at most one automatic
    // screenshot still aboard — forcing writeStoredComments to shed twice
    // before a write finally succeeds.
    let stored = null;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      const parsed = JSON.parse(value);
      const withScreenshots = parsed.filter((c) => c.contextScreenshot).length;
      if (withScreenshots > 1) {
        throw new Error("QuotaExceededError");
      }
      stored = parsed;
    });

    expect(writeStoredComments(comments)).toBe(true);
    expect(warn).toHaveBeenCalled();

    expect(stored).toHaveLength(3);
    const byId = (id) => stored.find((c) => c.id === id);

    // Oldest two shed, comments themselves untouched.
    expect(byId(1).contextScreenshot).toBeNull();
    expect(byId(1).text).toBe("comment 1");
    expect(byId(2).contextScreenshot).toBeNull();
    // Newest kept.
    expect(byId(3).contextScreenshot).toBe("data:image/jpeg;base64,auto3");
    // Deliberate, user-attached screenshots are never touched.
    expect(byId(2).screenshots).toEqual([
      "data:image/png;base64,user-attached",
    ]);
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

  it("matches ids across spellings — a numeric legacy id never duplicates", () => {
    // Ids are compared on their string form everywhere else (sameId); a
    // strict Set here would keep both spellings of one comment forever.
    const stored = [comment("7", "/other", "stale string spelling")];
    const merged = mergeForStorage(
      stored,
      [comment(7, "/other", "fresh numeric spelling")],
      "/"
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("fresh numeric spelling");
  });
});
