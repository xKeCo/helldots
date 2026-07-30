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

/**
 * @typedef {{ button: HTMLElement, menu: HTMLElement, close: () => void }} MenuEntry
 */

/** @type {Set<MenuEntry>} */
const openMenus = new Set();

/** @type {((e: MouseEvent) => void) | null} */
let outsideListener = null;

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
};

const stopWatching = () => {
  if (!outsideListener) return;
  document.removeEventListener("mousedown", outsideListener, true);
  outsideListener = null;
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
