import { describe, it, expect } from "vitest";
import {
  AUDIT_EVENTS,
  actorOf,
  recordEvent,
  normalizeHistory,
  serializeHistory,
  resolutionsOf,
  currentResolutionMs,
} from "../src/audit.js";

const strings = { anonymous: "Anonymous" };
const ACTOR = { id: "u_42", name: "Ana Pérez" };

// Timestamps are compared, never generated, so they are written out in full
// rather than derived from Date.now() — a test that computes its own offsets
// hides an off-by-one in the code it is checking.
const T0 = "2026-08-18T10:00:00.000Z";
const T1 = "2026-08-18T10:30:00.000Z";
const T2 = "2026-08-18T11:00:00.000Z";
const T3 = "2026-08-18T12:00:00.000Z";

const statusEvent = (at, from, to) => ({
  type: "status",
  at,
  actor: ACTOR,
  from,
  to,
});

describe("actorOf", () => {
  it("keeps both the id and the display name", () => {
    expect(actorOf({ name: "Ana Pérez", id: "u_42" }, strings)).toEqual({
      id: "u_42",
      name: "Ana Pérez",
    });
  });

  it("omits the id when the host supplies none", () => {
    expect(actorOf({ name: "Ana Pérez" }, strings)).toEqual({
      name: "Ana Pérez",
    });
  });

  it("falls back to the anonymous string with no user at all", () => {
    expect(actorOf(undefined, strings)).toEqual({ name: "Anonymous" });
  });

  it("trims both fields and drops one left empty", () => {
    expect(actorOf({ name: "  Ana  ", id: "   " }, strings)).toEqual({
      name: "Ana",
    });
  });

  it("caps a pathological name so one entry cannot inflate the log", () => {
    const actor = actorOf({ name: "x".repeat(500) }, strings);
    expect(actor.name).toHaveLength(64);
  });
});

describe("recordEvent", () => {
  it("appends an entry and creates the log on first use", () => {
    const comment = {};
    const entry = recordEvent(comment, "created", ACTOR);

    expect(comment.history).toEqual([entry]);
    expect(entry.type).toBe("created");
    expect(entry.actor).toEqual(ACTOR);
    expect(Date.parse(entry.at)).toBeGreaterThan(0);
  });

  it("refuses an event type the timeline has no label for", () => {
    const comment = { history: [] };
    expect(recordEvent(comment, "reacted", ACTOR)).toBeNull();
    expect(comment.history).toEqual([]);
  });

  it("carries the transition of a status move", () => {
    const comment = {};
    recordEvent(comment, "status", ACTOR, { from: "open", to: "resolved" });

    expect(comment.history[0]).toMatchObject({ from: "open", to: "resolved" });
  });

  it("keeps a null transition, which is how type and priority read as unset", () => {
    const comment = {};
    recordEvent(comment, "classified", ACTOR, {
      field: "type",
      from: "bug",
      to: null,
    });

    expect(comment.history[0]).toMatchObject({
      field: "type",
      from: "bug",
      to: null,
    });
  });

  it("refuses a classification field outside the three that exist", () => {
    const comment = {};
    recordEvent(comment, "classified", ACTOR, { field: "colour" });

    expect(comment.history[0].field).toBeUndefined();
  });

  it("lists exactly the four auditable actions", () => {
    expect(AUDIT_EVENTS).toEqual(["created", "edited", "status", "classified"]);
  });
});

describe("normalizeHistory", () => {
  it("returns null for anything that is not an array", () => {
    expect(normalizeHistory(undefined)).toBeNull();
    expect(normalizeHistory({ 0: "x" })).toBeNull();
  });

  it("returns null rather than an empty array when nothing survives", () => {
    expect(normalizeHistory([{ type: "reacted", at: T0 }])).toBeNull();
  });

  it("drops an entry whose timestamp does not parse", () => {
    const out = normalizeHistory([
      { type: "created", at: "yesterday", actor: ACTOR },
      { type: "edited", at: T1, actor: ACTOR },
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("edited");
  });

  it("coerces an actor that is not an object", () => {
    const out = normalizeHistory([{ type: "created", at: T0, actor: "Ana" }]);

    expect(out[0].actor).toEqual({ name: "" });
  });

  it("drops a non-string id from a hostile payload", () => {
    const out = normalizeHistory([
      {
        type: "created",
        at: T0,
        actor: { name: "Ana", id: { toString: () => "u_42" } },
      },
    ]);

    expect(out[0].actor.id).toBeUndefined();
  });

  it("sorts an interleaving, which is what merging two devices produces", () => {
    const out = normalizeHistory([
      { type: "status", at: T2, actor: ACTOR, from: "open", to: "resolved" },
      { type: "created", at: T0, actor: ACTOR },
      { type: "edited", at: T1, actor: ACTOR },
    ]);

    expect(out.map((entry) => entry.at)).toEqual([T0, T1, T2]);
  });
});

describe("serializeHistory", () => {
  it("returns null for an empty log, so an untouched corpus costs no bytes", () => {
    expect(serializeHistory([])).toBeNull();
    expect(serializeHistory(undefined)).toBeNull();
  });

  it("copies the actor out, so a host cannot reach back into overlay state", () => {
    const history = [{ type: "created", at: T0, actor: ACTOR }];
    const out = serializeHistory(history);

    out[0].actor.name = "Someone else";
    expect(history[0].actor.name).toBe("Ana Pérez");
  });
});

describe("resolutionsOf", () => {
  it("is empty for a comment that was never resolved", () => {
    expect(
      resolutionsOf({
        createdAt: T0,
        history: [statusEvent(T1, "open", "in_progress")],
      })
    ).toEqual([]);
  });

  it("measures each resolution from creation, not from the reopen", () => {
    const comment = {
      createdAt: T0,
      history: [
        statusEvent(T1, "open", "resolved"),
        statusEvent(T2, "resolved", "open"),
        statusEvent(T3, "open", "resolved"),
      ],
    };

    const out = resolutionsOf(comment);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      resolvedAt: T1,
      reopenedAt: T2,
      ms: 30 * 60_000,
    });
    expect(out[1]).toMatchObject({
      resolvedAt: T3,
      reopenedAt: null,
      ms: 120 * 60_000,
    });
  });

  it("clamps a resolution that predates its own creation to zero", () => {
    const out = resolutionsOf({
      createdAt: T2,
      history: [statusEvent(T0, "open", "resolved")],
    });

    expect(out[0].ms).toBe(0);
  });
});

describe("currentResolutionMs", () => {
  it("is null while the comment is not resolved", () => {
    expect(
      currentResolutionMs({
        status: "open",
        createdAt: T0,
        history: [
          statusEvent(T1, "open", "resolved"),
          statusEvent(T2, "resolved", "open"),
        ],
      })
    ).toBeNull();
  });

  it("measures the resolution currently in force", () => {
    expect(
      currentResolutionMs({
        status: "resolved",
        createdAt: T0,
        history: [
          statusEvent(T1, "open", "resolved"),
          statusEvent(T2, "resolved", "open"),
          statusEvent(T3, "open", "resolved"),
        ],
      })
    ).toBe(120 * 60_000);
  });

  it("falls back to resolvedAt for a comment resolved before the log existed", () => {
    expect(
      currentResolutionMs({ status: "resolved", createdAt: T0, resolvedAt: T1 })
    ).toBe(30 * 60_000);
  });

  it("is null when there is nothing to compute from, never an invented figure", () => {
    expect(
      currentResolutionMs({ status: "resolved", createdAt: T0 })
    ).toBeNull();
  });
});
