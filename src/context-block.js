// RF2 — the environment a comment was reported from, plus the automatic
// capture taken at that moment.
//
// Two surfaces render it as a disclosure, differing only in where it starts:
// the thread popover collapses it so the popover stays a conversation first
// and a bug report second, while the inbox detail opens expanded because that
// view is the one you go to in order to read everything.
//
// The caller owns the open/closed state — `expanded` in, `onToggle` out —
// because the inbox rebuilds its detail from scratch on every refresh, and a
// block that remembered its own state would spring back open on the next
// mutation.

import { CLASSES } from "./constants.js";
import { CARET_ICON_SVG } from "./components.js";

/**
 * @param {any} comment
 * @param {{ strings: object, onShowLightbox: (src: string) => void,
 *   collapsible?: boolean, expanded?: boolean,
 *   onToggle?: (expanded: boolean) => void }} deps
 * @returns {HTMLElement | null} null for comments created before RF1/RF2
 */
export const createContextBlock = (
  comment,
  { strings, onShowLightbox, collapsible = false, expanded = false, onToggle }
) => {
  const { context, contextScreenshot } = comment;
  if (!context && !contextScreenshot) return null;

  const block = document.createElement("div");
  block.className = CLASSES.CONTEXT_BLOCK;

  const body = document.createElement("div");
  body.className = CLASSES.CONTEXT_BODY;

  if (collapsible) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = CLASSES.CONTEXT_TOGGLE;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.innerHTML = `<span>${strings.contextSection}</span>${CARET_ICON_SVG}`;
    body.style.display = expanded ? "" : "none";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!isOpen));
      body.style.display = isOpen ? "none" : "";
      onToggle?.(!isOpen);
    });
    block.appendChild(toggle);
  } else {
    const title = document.createElement("div");
    title.className = CLASSES.CONTEXT_TITLE;
    title.textContent = strings.contextSection;
    block.appendChild(title);
  }

  if (contextScreenshot) {
    const caption = document.createElement("div");
    caption.className = CLASSES.CONTEXT_SCREENSHOT_CAPTION;
    caption.textContent = strings.autoScreenshotLabel;
    body.appendChild(caption);

    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = contextScreenshot;
    img.alt = strings.autoScreenshotLabel;
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      onShowLightbox(contextScreenshot);
    });
    body.appendChild(img);
  }

  if (context) {
    const addRow = (label, value) => {
      if (!value) return;
      const row = document.createElement("div");
      row.className = CLASSES.CONTEXT_ROW;
      const key = document.createElement("span");
      key.textContent = label;
      const val = document.createElement("span");
      val.textContent = value;
      row.appendChild(key);
      row.appendChild(val);
      body.appendChild(row);
    };

    const size = (dimensions) =>
      dimensions ? `${dimensions.width}×${dimensions.height}` : "";
    const named = (entry) =>
      entry?.name ? `${entry.name} ${entry.version || ""}`.trim() : "";

    addRow(strings.contextUrl, context.url);
    addRow(strings.contextViewport, size(context.viewport));
    addRow(strings.contextScreen, size(context.screen));
    addRow(strings.contextBrowser, named(context.browser));
    addRow(strings.contextOs, named(context.os));
  }

  block.appendChild(body);
  return block;
};
