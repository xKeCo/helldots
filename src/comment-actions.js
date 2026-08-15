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
import { confirmDialog } from "./confirm-dialog.js";

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
    in_review: strings.statusInReview,
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
 * The ⋯ dropdown, shared by the comment action strip and by each reply row.
 * One builder so both stay identical — same button, same menu chrome, same
 * single-open rule from menus.js — instead of two copies drifting apart.
 *
 * `tooltip` is optional, and the reply rows deliberately go without one: the
 * hover bubble is an absolutely positioned ::after on a button flush against
 * the right edge of `.thread-scroll`, and it stuck ~9px past it — enough to
 * give the thread a horizontal scrollbar it had no other reason to have. The
 * aria-label still names the control, and the menu it opens says the rest.
 *
 * An item may carry a `confirm` factory, and then nothing happens until the
 * user answers the modal. It lives here rather than at each call site so a
 * destructive item cannot be added without one being considered.
 *
 * A factory, not a plain object: the wording depends on the comment's state
 * ("and all of its replies"), and the menu is built once when the popover
 * opens. Reading it up front described the thread as it was minutes ago.
 *
 * @param {{
 *   label: string,
 *   tooltip?: string,
 *   items: Array<{
 *     label: string,
 *     onSelect: () => void,
 *     confirm?: () => import("./confirm-dialog.js").ConfirmStrings,
 *     feedbackLabel?: string,
 *   }>,
 * }} config
 * @returns {HTMLElement}
 */
export const createMoreMenu = ({ label, tooltip, items }) => {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = CLASSES.INBOX_ACTION_BTN;
  btn.dataset.action = "menu";
  if (tooltip) btn.dataset.hdTooltip = tooltip;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = DOTS_ICON_SVG;

  const menu = document.createElement("div");
  menu.className = CLASSES.INBOX_MENU;
  menu.setAttribute("role", "menu");

  const toggle = attachMenuToggle(btn, menu);

  for (const entry of items) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = CLASSES.INBOX_MENU_ITEM;
    item.setAttribute("role", "menuitem");
    item.textContent = entry.label;
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      // Copying to the clipboard succeeds invisibly. Closing the menu at once
      // would leave the user with no evidence it happened, and the icon-swap
      // trick the copy button uses needs a control that stays on screen — so
      // the item says so itself and the menu waits before closing.
      if (entry.feedbackLabel) {
        entry.onSelect();
        item.textContent = entry.feedbackLabel;
        setTimeout(() => {
          item.textContent = entry.label;
          toggle.close();
        }, 1200);
        return;
      }
      toggle.close();
      if (entry.confirm) {
        // Read before awaiting: onSelect may detach the row this button
        // lives in, and a detached node has no shadow root to mount into.
        const host = /** @type {any} */ (item.getRootNode());
        if (!(await confirmDialog(host, entry.confirm()))) return;
      }
      entry.onSelect();
    });
    menu.appendChild(item);
  }

  wrapper.appendChild(btn);
  wrapper.appendChild(menu);
  return wrapper;
};

/**
 * @param {Object} comment
 * @param {{ strings: Object, onCopy: Function, onCopyLink?: Function, onEdit?: Function, onSetStatus: Function, onSetType: Function, onSetPriority: Function, onDelete: Function }} deps
 * @returns {HTMLElement}
 */
export const createCommentActions = (
  comment,
  {
    strings,
    onCopy,
    onCopyLink,
    onEdit,
    onSetStatus,
    onSetType,
    onSetPriority,
    onDelete,
  }
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
      // Every STATUSES entry has a colour; the fallback only catches a status
      // this build doesn't know, which loadComments already coerces to `open`.
      colorOf: (status) => STATUS_COLORS[status] || STATUS_COLORS.open,
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
  actions.appendChild(
    createMoreMenu({
      label: strings.commentOptions,
      tooltip: strings.moreOptions,
      items: [
        {
          label: strings.copyLink,
          feedbackLabel: strings.linkCopied,
          onSelect: () => onCopyLink?.(comment),
        },
        {
          label: strings.editComment,
          onSelect: () => onEdit?.(comment),
        },
        {
          label: strings.deleteComment,
          onSelect: () => onDelete(comment),
          confirm: () => ({
            title: strings.confirmDeleteCommentTitle,
            // Two wordings rather than a reply count: what matters is that a
            // discussion is about to go with the comment, and saying so
            // avoids pluralising a number in every locale.
            message: comment.replies?.length
              ? strings.confirmDeleteThreadMessage
              : strings.confirmDeleteCommentMessage,
            confirmLabel: strings.confirmDelete,
            cancelLabel: strings.confirmCancel,
          }),
        },
      ],
    })
  );

  return actions;
};
