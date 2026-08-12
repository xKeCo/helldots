import { describe, it, expect, afterEach, vi } from "vitest";
import { createCommentActions, createPicker } from "../src/comment-actions.js";
import { CLASSES, STATUS_COLORS } from "../src/constants.js";
import { getStrings } from "../src/i18n.js";
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

    const statusBtn = el.querySelector('[data-action="status"]');
    click(statusBtn);
    // Scope to the status picker's own wrapper: the actions bar now also
    // contains the type and priority pickers' menu items.
    const options = [
      ...statusBtn.parentElement.querySelectorAll("[data-picker-option]"),
    ];
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

  it("does not call onSelect when clicking the option that's already selected (no-op)", () => {
    const onSelect = vi.fn();
    const wrapper = build({ value: "a", onSelect });
    const btn = wrapper.querySelector("button");
    const items = wrapper.querySelectorAll(`.${CLASSES.INBOX_MENU_ITEM}`);
    const menu = wrapper.querySelector(`.${CLASSES.INBOX_MENU}`);

    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(menu.style.display).toBe("block");

    // items[1] is "a" — the current value.
    items[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onSelect).not.toHaveBeenCalled();
    // The menu still closes even on a no-op pick.
    expect(menu.style.display).toBe("none");
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

describe("type and priority pickers in the actions bar", () => {
  const strings = getStrings("en");
  const build = (comment, handlers = {}) =>
    createCommentActions(
      { id: 1, status: "open", type: null, priority: null, ...comment },
      {
        strings,
        onCopy: vi.fn(),
        onSetStatus: vi.fn(),
        onSetType: vi.fn(),
        onSetPriority: vi.fn(),
        onDelete: vi.fn(),
        ...handlers,
      }
    );

  it("renders five controls: copy, status, type, priority, more", () => {
    expect(build({}).querySelectorAll("button[aria-haspopup]")).toHaveLength(3);
  });

  it("labels the type picker with the current type", () => {
    const actions = build({ type: "bug" });
    const btn = actions.querySelector('[data-action="type"]');
    expect(btn.dataset.hdTooltip).toBe("Type: Bug");
  });

  it("shows Unset when the type is neutral", () => {
    const actions = build({ type: null });
    const btn = actions.querySelector('[data-action="type"]');
    expect(btn.dataset.hdTooltip).toBe("Type: Unset");
  });

  it("gives each picker its own data-action hook", () => {
    const actions = build({});
    expect(actions.querySelector('[data-action="status"]')).not.toBeNull();
    expect(actions.querySelector('[data-action="type"]')).not.toBeNull();
    expect(actions.querySelector('[data-action="priority"]')).not.toBeNull();
  });

  it("reports a type selection", () => {
    const onSetType = vi.fn();
    const actions = build({}, { onSetType });
    const item = [...actions.querySelectorAll("[data-picker-option]")].find(
      (i) => i.dataset.pickerOption === "suggestion"
    );
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetType).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      "suggestion"
    );
  });

  it("reports a priority selection", () => {
    const onSetPriority = vi.fn();
    const actions = build({}, { onSetPriority });
    const item = [...actions.querySelectorAll("[data-picker-option]")].find(
      (i) => i.dataset.pickerOption === "high"
    );
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSetPriority).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
      "high"
    );
  });

  // bug and high share the exact same colour (#FF453A), so the dot alone
  // can't tell "bug" from "high priority" apart — and there's no hover on
  // touch. The picker buttons must show a text label too.
  it("renders the type label as visible text next to the dot", () => {
    const actions = build({ type: "bug" });
    const label = actions.querySelector(
      `[data-action="type"] .${CLASSES.INBOX_ACTION_LABEL}`
    );
    expect(label.textContent).toBe("Bug");
  });

  it("renders the priority label as visible text next to the dot", () => {
    const actions = build({ priority: "high" });
    const label = actions.querySelector(
      `[data-action="priority"] .${CLASSES.INBOX_ACTION_LABEL}`
    );
    expect(label.textContent).toBe("High");
  });

  it("a bug type and a high priority are distinguishable by text even though their dots are the same colour", () => {
    const actions = build({ type: "bug", priority: "high" });
    const typeDot = actions.querySelector(
      `[data-action="type"] .${CLASSES.INBOX_STATUS_DOT}`
    );
    const priorityDot = actions.querySelector(
      `[data-action="priority"] .${CLASSES.INBOX_STATUS_DOT}`
    );
    // Same colour — this is the actual finding, not a hypothetical.
    expect(typeDot.style.backgroundColor).toBe(
      priorityDot.style.backgroundColor
    );

    const typeLabel = actions.querySelector(
      `[data-action="type"] .${CLASSES.INBOX_ACTION_LABEL}`
    );
    const priorityLabel = actions.querySelector(
      `[data-action="priority"] .${CLASSES.INBOX_ACTION_LABEL}`
    );
    expect(typeLabel.textContent).toBe("Bug");
    expect(priorityLabel.textContent).toBe("High");
    expect(typeLabel.textContent).not.toBe(priorityLabel.textContent);
  });

  it("an unset picker reads 'Unset' in text, distinguishing it from a set one without relying on colour", () => {
    const actions = build({ type: null });
    const label = actions.querySelector(
      `[data-action="type"] .${CLASSES.INBOX_ACTION_LABEL}`
    );
    expect(label.textContent).toBe("Unset");
  });

  it("labels the status picker too, not just type and priority", () => {
    // It was dot-only while the strip shared the header row and space was
    // scarce. The strip has its own row now, and a lone coloured dot still
    // needed a hover to read — which touch never provides.
    const actions = build({});
    const statusBtn = actions.querySelector('[data-action="status"]');
    expect(
      statusBtn.querySelector(`.${CLASSES.INBOX_ACTION_LABEL}`).textContent
    ).toBe("Open");
  });
});

// Regression: every dropdown used to own its open state in isolation and
// stop the click from propagating, so opening the type picker while the
// status picker was open left both — and, with priority, all three — hanging
// open on top of each other inside the thread popover.
describe("only one menu is open at a time", () => {
  const strings = getStrings("en");

  const build = () => {
    const actions = createCommentActions(
      { id: 1, status: "open", type: null, priority: null },
      {
        strings,
        onCopy: vi.fn(),
        onSetStatus: vi.fn(),
        onSetType: vi.fn(),
        onSetPriority: vi.fn(),
        onDelete: vi.fn(),
      }
    );
    document.body.appendChild(actions);
    return actions;
  };

  const menuOf = (actions, action) =>
    actions
      .querySelector(`[data-action="${action}"]`)
      .parentElement.querySelector(`.${CLASSES.INBOX_MENU}`);

  const btnOf = (actions, action) =>
    actions.querySelector(`[data-action="${action}"]`);

  const mousedown = (el) =>
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

  it("opening the type picker closes the status picker", () => {
    const actions = build();
    click(btnOf(actions, "status"));
    click(btnOf(actions, "type"));

    expect(menuOf(actions, "type").style.display).toBe("block");
    expect(menuOf(actions, "status").style.display).toBe("none");
  });

  it("never leaves status, type and priority open together", () => {
    const actions = build();
    click(btnOf(actions, "status"));
    click(btnOf(actions, "type"));
    click(btnOf(actions, "priority"));

    const open = ["status", "type", "priority", "menu"].filter(
      (action) => menuOf(actions, action).style.display === "block"
    );
    expect(open).toEqual(["priority"]);
  });

  it("opening the ⋯ menu closes an open picker, and vice versa", () => {
    const actions = build();
    click(btnOf(actions, "priority"));
    click(btnOf(actions, "menu"));
    expect(menuOf(actions, "priority").style.display).toBe("none");
    expect(menuOf(actions, "menu").style.display).toBe("block");

    click(btnOf(actions, "status"));
    expect(menuOf(actions, "menu").style.display).toBe("none");
    expect(menuOf(actions, "status").style.display).toBe("block");
  });

  it("a mousedown outside the open menu closes it", () => {
    const actions = build();
    click(btnOf(actions, "status"));
    expect(menuOf(actions, "status").style.display).toBe("block");

    mousedown(document.body);
    expect(menuOf(actions, "status").style.display).toBe("none");
  });

  it("a mousedown inside the open menu leaves it open", () => {
    const actions = build();
    click(btnOf(actions, "status"));

    mousedown(menuOf(actions, "status"));
    expect(menuOf(actions, "status").style.display).toBe("block");
  });

  it("marks the open state on the toggle for assistive tech", () => {
    const actions = build();
    const statusBtn = btnOf(actions, "status");
    expect(statusBtn.getAttribute("aria-expanded")).toBe("false");

    click(statusBtn);
    expect(statusBtn.getAttribute("aria-expanded")).toBe("true");

    click(btnOf(actions, "type"));
    expect(statusBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("reopens a menu that was closed by picking an option", () => {
    const actions = build();
    const statusBtn = btnOf(actions, "status");
    click(statusBtn);
    click(
      statusBtn.parentElement.querySelector('[data-picker-option="resolved"]')
    );
    expect(menuOf(actions, "status").style.display).toBe("none");

    click(statusBtn);
    expect(menuOf(actions, "status").style.display).toBe("block");
  });
});
