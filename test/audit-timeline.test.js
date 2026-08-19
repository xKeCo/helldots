import { describe, it, expect } from "vitest";
import { createAuditTrail } from "../src/audit-timeline.js";
import en from "../src/locales/en.js";
import es from "../src/locales/es.js";

const T0 = "2026-08-18T10:00:00.000Z";
const T1 = "2026-08-18T10:30:00.000Z";
const T2 = "2026-08-18T11:00:00.000Z";
const T3 = "2026-08-18T12:00:00.000Z";

const ACTOR = { id: "u_secret_42", name: "Ana Pérez" };

const build = (comment, overrides = {}) =>
  createAuditTrail(comment, {
    strings: en,
    locale: "en",
    open: true,
    onToggle: () => {},
    ...overrides,
  });

const rowText = (el) =>
  [...el.querySelectorAll("li")].map((li) =>
    li.textContent.replace(/\s+/g, " ").trim()
  );

describe("createAuditTrail", () => {
  it("renders nothing for a comment that predates the log", () => {
    expect(build({ createdAt: T0 })).toBeNull();
    expect(build({ createdAt: T0, history: [] })).toBeNull();
  });

  it("puts the newest entry first, because that is what gets asked", () => {
    const el = build({
      createdAt: T0,
      history: [
        { type: "created", at: T0, actor: ACTOR },
        { type: "edited", at: T1, actor: ACTOR },
      ],
    });

    const rows = rowText(el);
    expect(rows[0]).toContain(en.auditEdited);
    expect(rows[1]).toContain(en.auditCreated);
  });

  it("shows the display name", () => {
    const el = build({
      createdAt: T0,
      history: [{ type: "created", at: T0, actor: ACTOR }],
    });

    expect(el.textContent).toContain("Ana Pérez");
  });

  it("never shows the actor id", () => {
    const el = build({
      createdAt: T0,
      history: [{ type: "created", at: T0, actor: ACTOR }],
    });

    expect(el.textContent).not.toContain("u_secret_42");
    expect(el.innerHTML).not.toContain("u_secret_42");
  });

  it("reads a status move with the same words the picker uses", () => {
    const el = build({
      createdAt: T0,
      history: [
        { type: "status", at: T1, actor: ACTOR, from: "open", to: "resolved" },
      ],
    });

    expect(rowText(el)[0]).toContain("Status: Open → Resolved");
  });

  it("reads a classification move the same way, unset included", () => {
    const el = build({
      createdAt: T0,
      history: [
        {
          type: "classified",
          at: T1,
          actor: ACTOR,
          field: "type",
          from: null,
          to: "bug",
        },
      ],
    });

    expect(rowText(el)[0]).toContain("Type: Unset → Bug");
  });

  it("reads a tag change as its own sentence, since a list has no transition", () => {
    const el = build({
      createdAt: T0,
      history: [{ type: "classified", at: T1, actor: ACTOR, field: "tags" }],
    });

    expect(rowText(el)[0]).toContain(en.auditTagsChanged);
  });

  it("translates, rather than hardcoding either language", () => {
    const el = build(
      {
        createdAt: T0,
        history: [
          {
            type: "status",
            at: T1,
            actor: ACTOR,
            from: "open",
            to: "resolved",
          },
        ],
      },
      { strings: es, locale: "es" }
    );

    expect(rowText(el)[0]).toContain("Estado: Abierto → Resuelto");
  });

  describe("previous resolutions", () => {
    const reopened = {
      createdAt: T0,
      status: "resolved",
      history: [
        { type: "status", at: T1, actor: ACTOR, from: "open", to: "resolved" },
        { type: "status", at: T2, actor: ACTOR, from: "resolved", to: "open" },
        { type: "status", at: T3, actor: ACTOR, from: "open", to: "resolved" },
      ],
    };

    it("lists the ones that were superseded, with how long each took", () => {
      const el = build(reopened);
      const section = el.querySelector("[data-audit-resolutions]");

      expect(section).not.toBeNull();
      expect(section.textContent).toContain("30m");
    });

    it("stays out of the way when the comment was resolved only once", () => {
      const el = build({
        createdAt: T0,
        status: "resolved",
        history: [
          {
            type: "status",
            at: T1,
            actor: ACTOR,
            from: "open",
            to: "resolved",
          },
        ],
      });

      expect(el.querySelector("[data-audit-resolutions]")).toBeNull();
    });
  });

  describe("the disclosure", () => {
    it("starts closed when the panel says it was closed", () => {
      const el = build(
        { createdAt: T0, history: [{ type: "created", at: T0, actor: ACTOR }] },
        { open: false }
      );

      const toggle = el.querySelector("button");
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      expect(toggle.nextElementSibling.hidden).toBe(true);
    });

    it("reports the flip so the panel can outlive its own rebuild", () => {
      const seen = [];
      const el = build(
        { createdAt: T0, history: [{ type: "created", at: T0, actor: ACTOR }] },
        { open: false, onToggle: (next) => seen.push(next) }
      );

      el.querySelector("button").click();

      expect(seen).toEqual([true]);
      expect(el.querySelector("button").getAttribute("aria-expanded")).toBe(
        "true"
      );
    });

    it("counts the entries on the toggle", () => {
      const el = build({
        createdAt: T0,
        history: [
          { type: "created", at: T0, actor: ACTOR },
          { type: "edited", at: T1, actor: ACTOR },
        ],
      });

      expect(el.querySelector("button").textContent).toContain("2");
    });
  });
});
