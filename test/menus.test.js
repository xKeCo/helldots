import { describe, it, expect, afterEach, vi } from "vitest";
import { attachMenuToggle, closeOpenMenus } from "../src/menus.js";
import { CLASSES } from "../src/constants.js";

const MENU_UP_CLASS = CLASSES.INBOX_MENU_UP;
const MENU_START_CLASS = CLASSES.INBOX_MENU_START;

// Builds a wired button + menu with n focusable menuitem buttons, attached
// to the document so focus() works.
const buildMenu = (n = 3) => {
  const button = document.createElement("button");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  for (let i = 0; i < n; i++) {
    const item = document.createElement("button");
    item.setAttribute("role", "menuitemradio");
    item.textContent = `option ${i}`;
    menu.appendChild(item);
  }
  document.body.appendChild(button);
  document.body.appendChild(menu);
  const toggle = attachMenuToggle(button, menu);
  return { button, menu, toggle };
};

const pressKey = (key) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
};

afterEach(() => {
  closeOpenMenus();
  document.body.innerHTML = "";
});

describe("menu registry", () => {
  it("keeps at most one menu open", () => {
    const first = buildMenu();
    const second = buildMenu();
    first.toggle.open();
    second.toggle.open();
    expect(first.toggle.isOpen()).toBe(false);
    expect(second.toggle.isOpen()).toBe(true);
  });

  it("a mousedown outside the open menu closes it", () => {
    const { toggle } = buildMenu();
    toggle.open();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(toggle.isOpen()).toBe(false);
  });

  describe("keyboard", () => {
    it("Escape closes the open menu and returns focus to its button", () => {
      const { button, toggle } = buildMenu();
      toggle.open();

      pressKey("Escape");

      expect(toggle.isOpen()).toBe(false);
      expect(document.activeElement).toBe(button);
    });

    it("Escape with a menu open never reaches later handlers", () => {
      // The overlay's Escape cascade tears down the whole popover; with a
      // menu open, Escape must close just the menu — one layer at a time.
      const { toggle } = buildMenu();
      const laterHandler = vi.fn();
      document.addEventListener("keydown", laterHandler);
      toggle.open();

      pressKey("Escape");

      document.removeEventListener("keydown", laterHandler);
      expect(toggle.isOpen()).toBe(false);
      expect(laterHandler).not.toHaveBeenCalled();
    });

    it("Escape with no open menu is left alone", () => {
      buildMenu();
      const laterHandler = vi.fn();
      document.addEventListener("keydown", laterHandler);

      pressKey("Escape");

      document.removeEventListener("keydown", laterHandler);
      expect(laterHandler).toHaveBeenCalled();
    });

    it("arrow keys move focus through the menu items, wrapping", () => {
      const { menu, toggle } = buildMenu(3);
      const items = [...menu.querySelectorAll("[role]")];
      toggle.open();

      pressKey("ArrowDown");
      expect(document.activeElement).toBe(items[0]);
      pressKey("ArrowDown");
      expect(document.activeElement).toBe(items[1]);
      pressKey("ArrowUp");
      expect(document.activeElement).toBe(items[0]);
      pressKey("ArrowUp");
      expect(document.activeElement).toBe(items[2]);
    });

    it("Home and End jump to the first and last item", () => {
      const { menu, toggle } = buildMenu(3);
      const items = [...menu.querySelectorAll("[role]")];
      toggle.open();

      pressKey("End");
      expect(document.activeElement).toBe(items[2]);
      pressKey("Home");
      expect(document.activeElement).toBe(items[0]);
    });
  });

  // Dropdowns open downward, and a scrolling ancestor clips them. Measured
  // on a reply row, whose menu grew 10px past the bottom of `.thread-scroll`:
  // the only way to read it was to scroll the thread. Every dropdown sitting
  // in a scroll container is exposed the same way — inbox cards live in
  // `.inbox-list` — so the measurement lives here, in the shared registry,
  // rather than at one call site.
  describe("flipping to stay visible", () => {
    const spanRect = (top, bottom) => () => ({
      top,
      bottom,
      height: bottom - top,
      left: 0,
      right: 100,
      width: 100,
    });

    // `clip` is the scrolling ancestor's vertical span, or null for a menu
    // with no clipping ancestor (then only the viewport bounds it).
    const buildPlaced = ({ clip, button: btn, menuHeight }) => {
      const host = document.createElement("div");
      if (clip) {
        host.style.overflowY = "auto";
        host.getBoundingClientRect = spanRect(clip[0], clip[1]);
      }
      const wrapper = document.createElement("div");
      const button = document.createElement("button");
      button.getBoundingClientRect = spanRect(btn[0], btn[1]);
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      // Where the menu sits when it opens downward: 4px under the button.
      menu.getBoundingClientRect = spanRect(
        btn[1] + 4,
        btn[1] + 4 + menuHeight
      );

      wrapper.append(button, menu);
      host.appendChild(wrapper);
      document.body.appendChild(host);
      return { button, menu, toggle: attachMenuToggle(button, menu) };
    };

    const opensUp = (menu) => menu.classList.contains(MENU_UP_CLASS);

    it("opens upward when the scrolling ancestor would clip it", () => {
      // The numbers measured in Chrome on the reported bug: a reply row's
      // menu at the bottom of a 157px-tall .thread-scroll.
      const { menu, toggle } = buildPlaced({
        clip: [691, 848],
        button: [790, 810],
        menuHeight: 70,
      });

      toggle.open();

      expect(opensUp(menu)).toBe(true);
    });

    it("stays downward when there is room below", () => {
      const { menu, toggle } = buildPlaced({
        clip: [691, 848],
        button: [700, 720],
        menuHeight: 70,
      });

      toggle.open();

      expect(opensUp(menu)).toBe(false);
    });

    it("stays downward when it fits in neither direction", () => {
      // Flipping a menu taller than its container only trades a clipped
      // bottom for a clipped top, and loses the item order the user expects.
      const { menu, toggle } = buildPlaced({
        clip: [700, 780],
        button: [750, 770],
        menuHeight: 200,
      });

      toggle.open();

      expect(opensUp(menu)).toBe(false);
    });

    it("respects the viewport when nothing else clips it", () => {
      const { menu, toggle } = buildPlaced({
        clip: null,
        button: [window.innerHeight - 30, window.innerHeight - 10],
        menuHeight: 70,
      });

      toggle.open();

      expect(opensUp(menu)).toBe(true);
    });

    it("re-decides on every open rather than staying flipped", () => {
      const { button, menu, toggle } = buildPlaced({
        clip: [691, 848],
        button: [790, 810],
        menuHeight: 70,
      });
      toggle.open();
      expect(opensUp(menu)).toBe(true);
      toggle.close();

      // The thread scrolled: the same row is now near the top of the
      // container, where the menu fits below again.
      button.getBoundingClientRect = spanRect(700, 720);
      menu.getBoundingClientRect = spanRect(724, 794);
      toggle.open();

      expect(opensUp(menu)).toBe(false);
    });
  });

  // The same story on the horizontal axis. The menus hang off their button's
  // right edge, which the tools at the end of the strip need, but the status
  // picker leads the row: its menu is wider than its button, so it reached
  // past the panel's left edge, where `overflow: hidden` cut it in half.
  //
  // The geometry is the one measured in Chrome — a 380px panel against the
  // right edge, its list inset by 1px, a 59px status button 25px in — laid
  // out in the 1024px viewport jsdom reports, since the viewport is the
  // outer bound the placement reads.
  describe("flipping sideways to stay visible", () => {
    const sideRect = (left, right) => () => ({
      top: 100,
      bottom: 120,
      height: 20,
      left,
      right,
      width: right - left,
    });

    // `clip` is the clipping ancestor's horizontal span, or null for a menu
    // bounded only by the viewport. The menu starts out right-aligned with
    // the button, which is what the CSS does.
    const buildRow = ({ clip, button: btn, menuWidth }) => {
      const host = document.createElement("div");
      if (clip) {
        host.style.overflowY = "auto";
        host.getBoundingClientRect = sideRect(clip[0], clip[1]);
      }
      const wrapper = document.createElement("div");
      const button = document.createElement("button");
      button.getBoundingClientRect = sideRect(btn[0], btn[1]);
      const menu = document.createElement("div");
      menu.setAttribute("role", "menu");
      menu.getBoundingClientRect = sideRect(btn[1] - menuWidth, btn[1]);

      wrapper.append(button, menu);
      host.appendChild(wrapper);
      document.body.appendChild(host);
      return { button, menu, toggle: attachMenuToggle(button, menu) };
    };

    const opensFromStart = (menu) => menu.classList.contains(MENU_START_CLASS);

    it("aligns to the button's left edge when the menu spills past the clipper", () => {
      // 130px of menu hanging off a button whose right edge is 84px into the
      // panel: 46px of it landed outside.
      const { menu, toggle } = buildRow({
        clip: [629, 1007],
        button: [654, 713],
        menuWidth: 130,
      });

      toggle.open();

      expect(opensFromStart(menu)).toBe(true);
    });

    it("stays right-aligned when the menu already fits", () => {
      // The type picker, one control further along the same strip.
      const { menu, toggle } = buildRow({
        clip: [629, 1007],
        button: [718, 808],
        menuWidth: 130,
      });

      toggle.open();

      expect(opensFromStart(menu)).toBe(false);
    });

    it("stays right-aligned when flipping would only spill out the other side", () => {
      // Same reasoning as the vertical case: a menu wider than what clips it
      // trades one cut edge for another, and loses the alignment the user
      // reaches for.
      const { menu, toggle } = buildRow({
        clip: [629, 759],
        button: [654, 713],
        menuWidth: 130,
      });

      toggle.open();

      expect(opensFromStart(menu)).toBe(false);
    });

    it("respects the viewport when nothing else clips it", () => {
      const { menu, toggle } = buildRow({
        clip: null,
        button: [10, 60],
        menuWidth: 130,
      });

      toggle.open();

      expect(opensFromStart(menu)).toBe(true);
    });
  });
});
