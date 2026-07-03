import { describe, it, expect, afterEach, vi } from "vitest";
import { createCommentActions } from "../src/comment-actions.js";
import { CLASSES, STATUS_COLORS } from "../src/constants.js";
import en from "../src/locales/en.js";
import es from "../src/locales/es.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const makeComment = (overrides = {}) => ({
  id: 1,
  text: "hola",
  status: "open",
  ...overrides,
});

const mount = (comment, deps = {}) => {
  const el = createCommentActions(comment, {
    strings: en,
    onCopy: vi.fn(),
    onSetStatus: vi.fn(),
    onDelete: vi.fn(),
    ...deps,
  });
  document.body.appendChild(el);
  return el;
};

const click = (el) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

describe("createCommentActions", () => {
  it("renders copy, status and more buttons with tooltips", () => {
    const el = mount(makeComment());
    const copy = el.querySelector('[data-action="copy"]');
    const status = el.querySelector('[data-action="status"]');
    const more = el.querySelector('[data-action="menu"]');

    expect(copy.dataset.hdTooltip).toBe("Copy agent context");
    expect(status.dataset.hdTooltip).toBe("Status: Open");
    expect(more.dataset.hdTooltip).toBe("More");
  });

  it("paints the status dot with the current status color", () => {
    const el = mount(makeComment({ status: "resolved" }));
    const dot = el.querySelector(`.${CLASSES.INBOX_STATUS_DOT}`);
    expect(dot.style.backgroundColor).toBeTruthy();
    expect(el.querySelector('[data-action="status"]').dataset.hdTooltip).toBe(
      "Status: Resolved"
    );
  });

  it("opens a menu with the four RF09 states, localized, current one checked", () => {
    const el = createCommentActions(makeComment({ status: "in_progress" }), {
      strings: es,
      onCopy: vi.fn(),
      onSetStatus: vi.fn(),
      onDelete: vi.fn(),
    });
    document.body.appendChild(el);

    click(el.querySelector('[data-action="status"]'));
    const options = [
      ...el.querySelectorAll('[data-status-option]'),
    ];
    expect(options.map((o) => o.textContent)).toEqual([
      "Abierto",
      "En progreso",
      "Resuelto",
      "Cerrado",
    ]);
    const checked = options.find(
      (o) => o.getAttribute("aria-checked") === "true"
    );
    expect(checked.dataset.statusOption).toBe("in_progress");
  });

  it("selecting a state calls onSetStatus, recolors the dot and updates the tooltip", () => {
    const onSetStatus = vi.fn();
    const comment = makeComment();
    const el = mount(comment, { onSetStatus });

    click(el.querySelector('[data-action="status"]'));
    click(el.querySelector('[data-status-option="resolved"]'));

    expect(onSetStatus).toHaveBeenCalledWith(comment, "resolved");
    const statusBtn = el.querySelector('[data-action="status"]');
    expect(statusBtn.dataset.hdTooltip).toBe("Status: Resolved");
    const dot = el.querySelector(`.${CLASSES.INBOX_STATUS_DOT}`);
    // jsdom normalizes hex to rgb; compare via a probe element
    const probe = document.createElement("span");
    probe.style.backgroundColor = STATUS_COLORS.resolved;
    expect(dot.style.backgroundColor).toBe(probe.style.backgroundColor);
  });

  it("copy calls onCopy and swaps the tooltip to Copied temporarily", () => {
    vi.useFakeTimers();
    const onCopy = vi.fn();
    const el = mount(makeComment(), { onCopy });
    const copy = el.querySelector('[data-action="copy"]');

    click(copy);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(copy.dataset.hdTooltip).toBe("Copied");

    vi.advanceTimersByTime(2000);
    expect(copy.dataset.hdTooltip).toBe("Copy agent context");
    vi.useRealTimers();
  });

  it("the more menu exposes Delete which calls onDelete", () => {
    const onDelete = vi.fn();
    const comment = makeComment();
    const el = mount(comment, { onDelete });

    click(el.querySelector('[data-action="menu"]'));
    click(
      el.querySelector(`.${CLASSES.INBOX_MENU_ITEM}:not([data-status-option])`)
    );

    expect(onDelete).toHaveBeenCalledWith(comment);
  });
});
