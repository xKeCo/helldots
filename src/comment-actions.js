// Shared per-comment action strip (copy agent context / lifecycle status /
// more menu) used by both the inbox cards and the thread popover header.
// Pure view: every mutation goes through the callbacks; the component only
// keeps its own dot color and tooltips in sync after a selection.

import {
  CLASSES,
  STATUSES,
  STATUS_COLORS,
  COMMENT_TYPES,
  TYPE_COLORS,
  PRIORITIES,
  PRIORITY_COLORS,
} from "./constants.js";
import { attachMenuToggle } from "./menus.js";

const COPY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const DOTS_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`;

export const copyToClipboard = (text) => {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {});
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch {}
  textarea.remove();
  return Promise.resolve();
};

export const statusLabelOf = (status, strings) =>
  ({
    open: strings.statusOpen,
    in_progress: strings.statusInProgress,
    resolved: strings.statusResolved,
  })[status] || strings.statusOpen;

export const typeLabelOf = (type, strings) =>
  ({
    bug: strings.typeBug,
    suggestion: strings.typeSuggestion,
    question: strings.typeQuestion,
    improvement: strings.typeImprovement,
  })[type] || strings.unset;

export const priorityLabelOf = (priority, strings) =>
  ({
    high: strings.priorityHigh,
    medium: strings.priorityMedium,
    low: strings.priorityLow,
  })[priority] || strings.unset;

/**
 * Dot-and-menu picker shared by the status, type and priority controls.
 * Keeps its own copy of the selection so the UI stays correct even when the
 * consumer's onSelect is async or doesn't mutate the comment in place.
 * @param {{
 *   action: string,
 *   options: Array<string|null>,
 *   value: string|null,
 *   colorOf: (option: string|null) => string,
 *   labelOf: (option: string|null) => string,
 *   tooltipLabel: string,
 *   onSelect: (option: string|null) => void,
 *   showLabel?: boolean,
 * }} config
 * @returns {HTMLElement}
 */
export const createPicker = ({
  action,
  options,
  value,
  colorOf,
  labelOf,
  tooltipLabel,
  onSelect,
  showLabel = false,
}) => {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = CLASSES.INBOX_ACTION_BTN;
  if (showLabel) btn.classList.add(CLASSES.INBOX_ACTION_BTN_LABELED);
  btn.dataset.action = action;
  btn.setAttribute("aria-haspopup", "true");

  const dot = document.createElement("span");
  dot.className = CLASSES.INBOX_STATUS_DOT;
  btn.appendChild(dot);

  // Type and priority share exact colours (bug === high === #FF453A), and
  // unset shares "no colour" with unset — the dot alone can't tell them
  // apart, and hover-only disambiguation doesn't exist on touch. A short
  // text label next to the dot makes the current value legible without it.
  let labelEl = null;
  if (showLabel) {
    labelEl = document.createElement("span");
    labelEl.className = CLASSES.INBOX_ACTION_LABEL;
    btn.appendChild(labelEl);
  }

  const menu = document.createElement("div");
  menu.className = CLASSES.INBOX_MENU;
  menu.setAttribute("role", "menu");

  const toggle = attachMenuToggle(btn, menu);

  let current = value;

  const syncUi = () => {
    const label = `${tooltipLabel}: ${labelOf(current)}`;
    dot.style.backgroundColor = colorOf(current);
    btn.dataset.hdTooltip = label;
    btn.setAttribute("aria-label", label);
    if (labelEl) labelEl.textContent = labelOf(current);
    menu
      .querySelectorAll("[data-picker-option]")
      .forEach((/** @type {HTMLElement} */ item) => {
        const raw = item.dataset.pickerOption;
        const option = raw === "" ? null : raw;
        item.setAttribute("aria-checked", String(option === current));
      });
  };

  for (const option of options) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = CLASSES.INBOX_MENU_ITEM;
    // "" is how a null option round-trips through a dataset string.
    item.dataset.pickerOption = option === null ? "" : option;
    item.setAttribute("role", "menuitemradio");

    const itemDot = document.createElement("span");
    itemDot.className = CLASSES.INBOX_STATUS_DOT;
    itemDot.style.backgroundColor = colorOf(option);
    item.appendChild(itemDot);
    item.appendChild(document.createTextNode(labelOf(option)));

    item.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle.close();
      // No-op: re-picking the option that's already selected must not fire
      // onSelect — for the status picker that would re-stamp resolvedAt on
      // every redundant "Resolved" click, destroying RF5's elapsed time.
      if (option === current) return;
      current = option;
      onSelect(option);
      syncUi();
    });
    menu.appendChild(item);
  }

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
  syncUi();
  return wrapper;
};

/**
 * @param {Object} comment
 * @param {{ strings: Object, onCopy: Function, onSetStatus: Function, onSetType: Function, onSetPriority: Function, onDelete: Function }} deps
 * @returns {HTMLElement}
 */
export const createCommentActions = (
  comment,
  { strings, onCopy, onSetStatus, onSetType, onSetPriority, onDelete }
) => {
  const actions = document.createElement("div");
  actions.className = CLASSES.INBOX_CARD_ACTIONS;

  // --- copy agent context ---
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = CLASSES.INBOX_ACTION_BTN;
  copyBtn.dataset.action = "copy";
  copyBtn.dataset.hdTooltip = strings.copyAgentContext;
  copyBtn.setAttribute("aria-label", strings.copyAgentContext);
  copyBtn.innerHTML = COPY_ICON_SVG;
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onCopy(comment);
    copyBtn.innerHTML = CHECK_ICON_SVG;
    copyBtn.dataset.hdTooltip = strings.copied;
    setTimeout(() => {
      copyBtn.innerHTML = COPY_ICON_SVG;
      copyBtn.dataset.hdTooltip = strings.copyAgentContext;
    }, 1500);
  });
  actions.appendChild(copyBtn);

  // --- lifecycle status picker (RF09) ---
  actions.appendChild(
    createPicker({
      action: "status",
      options: STATUSES,
      value: comment.status || "open",
      colorOf: (status) => STATUS_COLORS[status] || "",
      labelOf: (status) => statusLabelOf(status, strings),
      tooltipLabel: strings.statusLabel,
      onSelect: (status) => onSetStatus(comment, status),
      // Labelled like type and priority: the strip is on its own row now, so
      // there is room, and a lone coloured dot needed a hover to be read —
      // which touch never provides.
      showLabel: true,
    })
  );

  // --- category picker (RF3) ---
  actions.appendChild(
    createPicker({
      action: "type",
      // `null` first: returning to the neutral state must be reachable.
      options: [null, ...COMMENT_TYPES],
      value: comment.type || null,
      colorOf: (type) => TYPE_COLORS[type] || "transparent",
      labelOf: (type) => typeLabelOf(type, strings),
      tooltipLabel: strings.typeLabel,
      onSelect: (type) => onSetType?.(comment, type),
      showLabel: true,
    })
  );

  // --- priority picker (RF4) ---
  actions.appendChild(
    createPicker({
      action: "priority",
      options: [null, ...PRIORITIES],
      value: comment.priority || null,
      colorOf: (priority) => PRIORITY_COLORS[priority] || "transparent",
      labelOf: (priority) => priorityLabelOf(priority, strings),
      tooltipLabel: strings.priorityLabel,
      onSelect: (priority) => onSetPriority?.(comment, priority),
      showLabel: true,
    })
  );

  // --- more (⋯) menu ---
  const menuWrapper = document.createElement("div");
  menuWrapper.style.position = "relative";

  const menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = CLASSES.INBOX_ACTION_BTN;
  menuBtn.dataset.action = "menu";
  menuBtn.dataset.hdTooltip = strings.moreOptions;
  menuBtn.setAttribute("aria-label", strings.commentOptions);
  menuBtn.innerHTML = DOTS_ICON_SVG;

  const menu = document.createElement("div");
  menu.className = CLASSES.INBOX_MENU;

  const menuToggle = attachMenuToggle(menuBtn, menu);

  const deleteItem = document.createElement("button");
  deleteItem.type = "button";
  deleteItem.className = CLASSES.INBOX_MENU_ITEM;
  deleteItem.textContent = strings.deleteComment;
  deleteItem.addEventListener("click", (e) => {
    e.stopPropagation();
    menuToggle.close();
    onDelete(comment);
  });
  menu.appendChild(deleteItem);

  menuWrapper.appendChild(menuBtn);
  menuWrapper.appendChild(menu);
  actions.appendChild(menuWrapper);

  return actions;
};
