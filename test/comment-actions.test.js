import { describe, it, expect, afterEach, vi } from "vitest";
import { createCommentActions, createPicker } from "../src/comment-actions.js";
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
    const options = [...el.querySelectorAll("[data-picker-option]")];
    expect(options.map((o) => o.textContent)).toEqual([
      "Abierto",
      "En progreso",
      "Resuelto",
    ]);
    const checked = options.find(
      (o) => o.getAttribute("aria-checked") === "true"
    );
    expect(checked.dataset.pickerOption).toBe("in_progress");
  });

  it("selecting a state calls onSetStatus, recolors the dot and updates the tooltip", () => {
    const onSetStatus = vi.fn();
    const comment = makeComment();
    const el = mount(comment, { onSetStatus });

    click(el.querySelector('[data-action="status"]'));
    click(el.querySelector('[data-picker-option="resolved"]'));

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
      el.querySelector(`.${CLASSES.INBOX_MENU_ITEM}:not([data-picker-option])`)
    );

    expect(onDelete).toHaveBeenCalledWith(comment);
  });
});

describe("createPicker", () => {
  const build = (overrides = {}) =>
    createPicker({
      action: "test",
      options: [null, "a", "b"],
      value: "a",
      colorOf: (o) => (o === "a" ? "#111111" : "#222222"),
      labelOf: (o) => (o === null ? "Unset" : `Label ${o}`),
      tooltipLabel: "Thing",
      onSelect: vi.fn(),
      ...overrides,
    });

  it("renders one menu item per option", () => {
    const wrapper = build();
    expect(
      wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`)
    ).toHaveLength(3);
  });

  it("marks the current value as checked", () => {
    const wrapper = build();
    const checked = wrapper.querySelector('[aria-checked="true"]');
    expect(checked.textContent).toContain("Label a");
  });

  it("reflects the current value in the tooltip and aria-label", () => {
    const btn = build().querySelector("button");
    expect(btn.dataset.hdTooltip).toBe("Thing: Label a");
    expect(btn.getAttribute("aria-label")).toBe("Thing: Label a");
  });

  it("toggles the menu open and closed", () => {
    const wrapper = build();
    const btn = wrapper.querySelector("button");
    const menu = wrapper.querySelector(`.${CLASSES.INBOX_MENU}`);

    expect(menu.style.display).toBe("none");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.style.display).toBe("block");
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.style.display).toBe("none");
  });

  it("reports the selection and re-syncs its own UI", () => {
    const onSelect = vi.fn();
    const wrapper = build({ onSelect });
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);

    items[2].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith("b");
    expect(wrapper.querySelector("button").dataset.hdTooltip).toBe(
      "Thing: Label b"
    );
  });

  it("passes null for the unset entry", () => {
    const onSelect = vi.fn();
    const wrapper = build({ onSelect });
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);

    items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("handles null as initial value correctly", () => {
    const wrapper = build({ value: null });
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);
    const btn = wrapper.querySelector("button");

    // Unset (null) entry should be checked
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    // Other entries should not be checked
    expect(items[1].getAttribute("aria-checked")).toBe("false");
    expect(items[2].getAttribute("aria-checked")).toBe("false");
    // Tooltip should reflect the Unset label
    expect(btn.dataset.hdTooltip).toBe("Thing: Unset");
    expect(btn.getAttribute("aria-label")).toBe("Thing: Unset");
  });

  it("re-syncs ui when selecting the unset entry", () => {
    const onSelect = vi.fn();
    const wrapper = build({ value: "b", onSelect });
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);
    const btn = wrapper.querySelector("button");

    // Initially, "b" is selected
    expect(items[2].getAttribute("aria-checked")).toBe("true");
    expect(items[0].getAttribute("aria-checked")).toBe("false");
    expect(btn.dataset.hdTooltip).toBe("Thing: Label b");

    // Click the unset entry
    items[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Verify callback was invoked
    expect(onSelect).toHaveBeenCalledWith(null);
    // Verify aria-checked was moved to unset entry
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    expect(items[2].getAttribute("aria-checked")).toBe("false");
    // Verify tooltip and aria-label updated to unset label
    expect(btn.dataset.hdTooltip).toBe("Thing: Unset");
    expect(btn.getAttribute("aria-label")).toBe("Thing: Unset");
  });
});
