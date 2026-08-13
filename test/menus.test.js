import { describe, it, expect, afterEach, vi } from "vitest";
import { attachMenuToggle, closeOpenMenus } from "../src/menus.js";

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
});
