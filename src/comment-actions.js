// Shared per-comment action strip (copy agent context / lifecycle status /
// more menu) used by both the inbox cards and the thread popover header.
// Pure view: every mutation goes through the callbacks; the component only
// keeps its own dot color and tooltips in sync after a selection.

import { CLASSES, STATUSES, STATUS_COLORS } from "./constants.js";

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

/**
 * @param {Object} comment
 * @param {{ strings: Object, onCopy: Function, onSetStatus: Function, onDelete: Function }} deps
 * @returns {HTMLElement}
 */
export const createCommentActions = (
  comment,
  { strings, onCopy, onSetStatus, onDelete }
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
  const statusWrapper = document.createElement("div");
  statusWrapper.style.position = "relative";

  const statusBtn = document.createElement("button");
  statusBtn.type = "button";
  statusBtn.className = CLASSES.INBOX_ACTION_BTN;
  statusBtn.dataset.action = "status";
  statusBtn.setAttribute("aria-haspopup", "true");

  const dot = document.createElement("span");
  dot.className = CLASSES.INBOX_STATUS_DOT;
  statusBtn.appendChild(dot);

  const statusMenu = document.createElement("div");
  statusMenu.className = CLASSES.INBOX_MENU;
  statusMenu.style.display = "none";
  statusMenu.setAttribute("role", "menu");

  // Tracked locally so the UI stays correct even if the consumer's
  // onSetStatus is asynchronous or doesn't mutate the comment in place.
  let currentStatus = comment.status || "open";

  const syncStatusUi = () => {
    const label = statusLabelOf(currentStatus, strings);
    dot.style.backgroundColor = STATUS_COLORS[currentStatus] || "";
    statusBtn.dataset.hdTooltip = `${strings.statusLabel}: ${label}`;
    statusBtn.setAttribute("aria-label", `${strings.statusLabel}: ${label}`);
    statusMenu
      .querySelectorAll("[data-status-option]")
      .forEach((/** @type {HTMLElement} */ option) => {
        option.setAttribute(
          "aria-checked",
          String(option.dataset.statusOption === currentStatus)
        );
      });
  };

  for (const status of STATUSES) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = CLASSES.INBOX_MENU_ITEM;
    option.dataset.statusOption = status;
    option.setAttribute("role", "menuitemradio");

    const optionDot = document.createElement("span");
    optionDot.className = CLASSES.INBOX_STATUS_DOT;
    optionDot.style.backgroundColor = STATUS_COLORS[status];
    option.appendChild(optionDot);
    option.appendChild(document.createTextNode(statusLabelOf(status, strings)));

    option.addEventListener("click", (e) => {
      e.stopPropagation();
      statusMenu.style.display = "none";
      currentStatus = status;
      onSetStatus(comment, status);
      syncStatusUi();
    });
    statusMenu.appendChild(option);
  }

  statusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    statusMenu.style.display =
      statusMenu.style.display === "none" ? "block" : "none";
  });

  statusWrapper.appendChild(statusBtn);
  statusWrapper.appendChild(statusMenu);
  actions.appendChild(statusWrapper);
  syncStatusUi();

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
  menu.style.display = "none";

  const deleteItem = document.createElement("button");
  deleteItem.type = "button";
  deleteItem.className = CLASSES.INBOX_MENU_ITEM;
  deleteItem.textContent = strings.deleteComment;
  deleteItem.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = "none";
    onDelete(comment);
  });
  menu.appendChild(deleteItem);

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });

  menuWrapper.appendChild(menuBtn);
  menuWrapper.appendChild(menu);
  actions.appendChild(menuWrapper);

  return actions;
};
