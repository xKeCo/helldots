// Shared open/close rule for every dropdown in the widget: the status, type
// and priority pickers, the ⋯ menu and the inbox filter.
//
// Each menu used to own its state in isolation *and* stop the click from
// propagating, so nothing could ever close one except its own button. Opening
// a second picker left the first hanging open (three menus could overlap at
// once), and clicking elsewhere inside the panel closed none of them.
//
// The registry gives them one rule instead: at most one menu open, and any
// mousedown outside the open menu closes it. The outside listener is on
// `document` in the CAPTURE phase precisely because the toggles call
// stopPropagation() — a bubble-phase listener would never hear the click.

import { CLASSES } from "./constants.js";

/**
 * @typedef {{ button: HTMLElement, menu: HTMLElement, close: () => void }} MenuEntry
 */

/** @type {Set<MenuEntry>} */
const openMenus = new Set();

/** @type {((e: MouseEvent) => void) | null} */
let outsideListener = null;

/** @type {((e: KeyboardEvent) => void) | null} */
let keyListener = null;

const menuItems = (menu) => [
  ...menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]'),
];

/** Vertical gap between a menu and the button it belongs to (matches the CSS). */
const MENU_GAP = 4;

/**
 * The nearest ancestor that would clip the menu, or null when only the
 * viewport bounds it. Anything with a non-visible overflow clips: the thread's
 * scroll container and the inbox list are the two that matter, and both are
 * exactly where a dropdown near the bottom edge used to become unreachable.
 *
 * Walking up stops at the shadow root, whose overflow is not ours to read.
 *
 * @param {HTMLElement} menu
 * @returns {DOMRect | null}
 */
const clipperRectOf = (menu) => {
  for (let el = menu.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (overflowX !== "visible" || overflowY !== "visible") {
      return el.getBoundingClientRect();
    }
  }
  return null;
};

/**
 * Opens the menu upward when it would otherwise be clipped below — and only
 * when it actually fits up there. Flipping a menu taller than its container
 * would just clip the other end while also reversing the position the user
 * reaches for, so in that case it stays put.
 *
 * Measured on every open, never cached: a menu on a row that scrolled since
 * last time has different room than it did.
 *
 * @param {HTMLElement} button
 * @param {HTMLElement} menu the menu, already displayed and placed downward
 */
const placeMenu = (button, menu) => {
  menu.classList.remove(CLASSES.INBOX_MENU_UP);

  const clipper = clipperRectOf(menu);
  const floor = Math.min(clipper?.bottom ?? Infinity, window.innerHeight);
  const ceiling = Math.max(clipper?.top ?? 0, 0);

  const { height } = menu.getBoundingClientRect();
  const anchor = button.getBoundingClientRect();
  const bottomIfDown = anchor.bottom + MENU_GAP + height;
  const topIfUp = anchor.top - MENU_GAP - height;

  if (bottomIfDown > floor && topIfUp >= ceiling) {
    menu.classList.add(CLASSES.INBOX_MENU_UP);
  }
};

// Menus live inside the shadow root, so `e.target` on a document listener is
// retargeted to the host. composedPath() is the only way to see the element
// that was really clicked.
const eventHits = (el, e) => {
  const path = typeof e.composedPath === "function" ? e.composedPath() : [];
  return path.includes(el) || el.contains(/** @type {Node} */ (e.target));
};

const startWatching = () => {
  if (outsideListener) return;
  outsideListener = (e) => {
    for (const entry of [...openMenus]) {
      if (eventHits(entry.menu, e) || eventHits(entry.button, e)) continue;
      // A menu detached by a re-render is never in the click path, so this
      // also drops stale entries — which is what eventually releases this
      // very listener.
      entry.close();
    }
  };
  document.addEventListener("mousedown", outsideListener, true);

  // role="menu"/"menuitem" promises keyboard behavior (ARIA menu pattern):
  // Escape closes THIS layer only — never the popover behind it, which is
  // why the listener runs in the capture phase and stops propagation — and
  // the arrow keys walk the items. Registered while a menu is open, exactly
  // like the mousedown watcher.
  keyListener = (e) => {
    const entry = [...openMenus].pop();
    if (!entry) return;

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      entry.close();
      entry.button.focus();
      return;
    }

    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      const items = menuItems(entry.menu);
      if (items.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      // Menus live in a shadow root, where document.activeElement reports
      // the host — the root's own activeElement is the real one.
      const root = /** @type {Document | ShadowRoot} */ (
        entry.menu.getRootNode()
      );
      const index = items.indexOf(root.activeElement);
      let next;
      if (e.key === "Home") next = 0;
      else if (e.key === "End") next = items.length - 1;
      else if (index === -1)
        next = e.key === "ArrowDown" ? 0 : items.length - 1;
      else {
        const step = e.key === "ArrowDown" ? 1 : -1;
        next = (index + step + items.length) % items.length;
      }
      items[next].focus();
    }
  };
  document.addEventListener("keydown", keyListener, true);
};

const stopWatching = () => {
  if (!outsideListener) return;
  document.removeEventListener("mousedown", outsideListener, true);
  outsideListener = null;
  document.removeEventListener("keydown", keyListener, true);
  keyListener = null;
};

/** Closes every open menu. Safe to call when none are open. */
export const closeOpenMenus = () => {
  for (const entry of [...openMenus]) entry.close();
};

/**
 * Wires a button to its dropdown so it participates in the single-open rule.
 * The menu's `display` stays the source of truth, so callers that hide it by
 * hand stay consistent with the registry.
 *
 * @param {HTMLElement} button
 * @param {HTMLElement} menu
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean }}
 */
export const attachMenuToggle = (button, menu) => {
  /** @type {MenuEntry} */
  const entry = {
    button,
    menu,
    close: () => {
      menu.style.display = "none";
      button.setAttribute("aria-expanded", "false");
      openMenus.delete(entry);
      if (openMenus.size === 0) stopWatching();
    },
  };

  const open = () => {
    closeOpenMenus();
    menu.style.display = "block";
    // Displayed before measuring: a menu still at display:none has no box to
    // measure, so its height would read as zero and it would never flip.
    placeMenu(button, menu);
    button.setAttribute("aria-expanded", "true");
    openMenus.add(entry);
    startWatching();
  };

  const isOpen = () => menu.style.display !== "none";

  menu.style.display = "none";
  button.setAttribute("aria-expanded", "false");

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    // Read the state off the DOM, not off the set: a menu hidden directly by
    // a caller (or detached by a re-render) would otherwise be stuck
    // "open" in the registry and refuse to reopen.
    const wasOpen = isOpen();
    closeOpenMenus();
    if (!wasOpen) open();
  });

  return { open, close: entry.close, isOpen };
};
