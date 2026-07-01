import { CLASSES, IDS } from "./constants.js";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatRelativeTime = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
};

const formatFullDate = (date) => {
  const d = new Date(date);
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
};

const createMetaElement = (author, createdAt) => {
  const meta = document.createElement("div");
  meta.className = CLASSES.THREAD_META;

  const authorEl = document.createElement("span");
  authorEl.className = CLASSES.THREAD_AUTHOR;
  authorEl.textContent = author || "Anonymous";

  const timeEl = document.createElement("span");
  timeEl.className = CLASSES.THREAD_TIME;
  timeEl.textContent = formatRelativeTime(createdAt);
  timeEl.dataset.fullDate = formatFullDate(createdAt);

  meta.appendChild(authorEl);
  meta.appendChild(timeEl);

  return meta;
};

const getShortcutText = (options) => {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const modifierMap = {
    alt: isMac ? "⌥" : "Alt",
    ctrl: isMac ? "⌘" : "Ctrl",
    shift: "⇧",
  };

  const modifier = modifierMap[options.shortcutModifier] || modifierMap.alt;
  const key = options.shortcutKey?.toUpperCase() || "C";

  return `${modifier} + ${key}`;
};

const ATTACH_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;

const SEND_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/></svg>`;

const COMMENT_BUBBLE_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" stroke-linejoin="round" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.8914 10.4028L2.98327 10.6318C3.22909 11.2445 3.5 12.1045 3.5 13C3.5 13.3588 3.4564 13.7131 3.38773 14.0495C3.69637 13.9446 4.01409 13.8159 4.32918 13.6584C4.87888 13.3835 5.33961 13.0611 5.70994 12.7521L6.22471 12.3226L6.88809 12.4196C7.24851 12.4724 7.61994 12.5 8 12.5C11.7843 12.5 14.5 9.85569 14.5 7C14.5 4.14431 11.7843 1.5 8 1.5C4.21574 1.5 1.5 4.14431 1.5 7C1.5 8.18175 1.94229 9.29322 2.73103 10.2153L2.8914 10.4028ZM2.8135 15.7653C1.76096 16 1 16 1 16C1 16 1.43322 15.3097 1.72937 14.4367C1.88317 13.9834 2 13.4808 2 13C2 12.3826 1.80733 11.7292 1.59114 11.1903C0.591845 10.0221 0 8.57152 0 7C0 3.13401 3.58172 0 8 0C12.4183 0 16 3.13401 16 7C16 10.866 12.4183 14 8 14C7.54721 14 7.10321 13.9671 6.67094 13.9038C6.22579 14.2753 5.66881 14.6656 5 15C4.23366 15.3832 3.46733 15.6195 2.8135 15.7653Z"/></svg>`;

const MENU_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" stroke-linejoin="round" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M1.67705 7.5L3.92705 3H12.0729L14.3229 7.5H10H9.25V8.25C9.25 8.94036 8.69036 9.5 8 9.5C7.30964 9.5 6.75 8.94036 6.75 8.25V7.5H6H1.67705ZM1.5 9V12C1.5 12.5523 1.94772 13 2.5 13H13.5C14.0523 13 14.5 12.5523 14.5 12V9H10.6465C10.32 10.1543 9.25878 11 8 11C6.74122 11 5.67998 10.1543 5.35352 9H1.5ZM3 1.5H13L15.8944 7.28885C15.9639 7.42771 16 7.58082 16 7.73607V12C16 13.3807 14.8807 14.5 13.5 14.5H2.5C1.11929 14.5 0 13.3807 0 12V7.73607C0 7.58082 0.0361451 7.42771 0.105573 7.28885L3 1.5Z"/></svg>`;

/**
 * Shared input area component used by both the comment box and the thread popover.
 * Returns the container element and references to key child elements.
 * @param {Object} options
 * @param {string} options.areaClassName
 * @param {"textarea" | "input"} [options.inputTag]
 * @param {string} [options.inputClassName]
 * @param {string} [options.inputId]
 * @param {string} options.inputPlaceholder
 * @param {string} [options.submitBtnId]
 * @param {string} [options.fileInputId]
 */
const createInputArea = ({
  areaClassName,
  inputTag = "textarea",
  inputClassName,
  inputId,
  inputPlaceholder,
  submitBtnId,
  fileInputId,
}) => {
  const container = document.createElement("div");
  container.className = areaClassName;

  /** @type {HTMLInputElement | HTMLTextAreaElement} */
  const inputEl = document.createElement(inputTag);
  if (inputId) inputEl.id = inputId;
  if (inputClassName) inputEl.className = inputClassName;
  inputEl.placeholder = inputPlaceholder;
  inputEl.setAttribute("aria-label", inputPlaceholder);
  if (inputTag === "input")
    /** @type {HTMLInputElement} */ (inputEl).type = "text";

  const screenshotsContainer = document.createElement("div");
  screenshotsContainer.className = CLASSES.SCREENSHOTS_CONTAINER;

  const actionsBar = document.createElement("div");
  actionsBar.className = CLASSES.COMMENT_ACTIONS_BAR;

  const attachBtn = document.createElement("button");
  attachBtn.className = CLASSES.ATTACH_IMAGE_BTN;
  attachBtn.type = "button";
  attachBtn.setAttribute("aria-label", "Attach image");
  attachBtn.innerHTML = ATTACH_ICON_SVG;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  if (fileInputId) fileInput.id = fileInputId;
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  const submitBtn = document.createElement("button");
  if (submitBtnId) submitBtn.id = submitBtnId;
  submitBtn.className = CLASSES.THREAD_SUBMIT;
  submitBtn.type = "button";
  submitBtn.setAttribute("aria-label", "Send");
  submitBtn.innerHTML = SEND_ICON_SVG;

  actionsBar.appendChild(attachBtn);
  actionsBar.appendChild(fileInput);
  actionsBar.appendChild(submitBtn);

  container.appendChild(inputEl);
  container.appendChild(screenshotsContainer);
  container.appendChild(actionsBar);

  return {
    container,
    inputEl,
    screenshotsContainer,
    attachBtn,
    fileInput,
    submitBtn,
  };
};

const createActionWithTooltip = (btnClass, btnSvg, tooltipContent, label) => {
  const wrapper = document.createElement("div");
  wrapper.className = CLASSES.TOOLBAR_ACTION_WRAPPER;

  const tooltip = document.createElement("div");
  tooltip.className = CLASSES.TOOLBAR_ACTION_TOOLTIP;
  tooltipContent.forEach((el) => tooltip.appendChild(el));

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${CLASSES.TOOLBAR_ACTION_BTN} ${btnClass}`;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = btnSvg;

  wrapper.appendChild(tooltip);
  wrapper.appendChild(btn);
  return wrapper;
};

export const createToolbar = (options = {}) => {
  const toolbar = document.createElement("div");
  toolbar.id = IDS.TOOLBAR;

  const actions = document.createElement("div");
  actions.className = CLASSES.TOOLBAR_ACTIONS;

  const commentLabel = document.createElement("span");
  commentLabel.className = CLASSES.TOOLBAR_TEXT;
  commentLabel.textContent = "Comment";

  const shortcutKey = document.createElement("span");
  shortcutKey.className = CLASSES.SHORTCUT_HINT;
  shortcutKey.textContent = getShortcutText(options);

  const commentWrapper = createActionWithTooltip(
    CLASSES.TOOLBAR_COMMENT_BTN,
    COMMENT_BUBBLE_SVG,
    [commentLabel, shortcutKey],
    "Comment"
  );
  commentWrapper
    .querySelector(`.${CLASSES.TOOLBAR_COMMENT_BTN}`)
    ?.setAttribute("aria-pressed", "false");

  const inboxLabel = document.createElement("span");
  inboxLabel.className = CLASSES.TOOLBAR_TEXT;
  inboxLabel.textContent = "Inbox";

  const inboxWrapper = createActionWithTooltip(
    CLASSES.TOOLBAR_MENU_BTN,
    MENU_ICON_SVG,
    [inboxLabel],
    "Inbox"
  );

  actions.appendChild(commentWrapper);
  actions.appendChild(inboxWrapper);
  toolbar.appendChild(actions);

  return toolbar;
};

export const createCommentBox = () => {
  const commentBox = document.createElement("div");
  commentBox.id = IDS.COMMENT_BOX;
  commentBox.setAttribute("role", "dialog");
  commentBox.setAttribute("aria-label", "New comment");

  const { container: inputArea } = createInputArea({
    areaClassName: CLASSES.COMMENT_INPUT_AREA,
    inputTag: "textarea",
    inputId: IDS.COMMENT_INPUT,
    inputPlaceholder: "Type your comment...",
    submitBtnId: IDS.SUBMIT_COMMENT,
    fileInputId: IDS.ATTACH_IMAGE_INPUT,
  });

  commentBox.appendChild(inputArea);
  commentBox.style.display = "none";
  return commentBox;
};

export const createCommentCircle = (comment) => {
  const circle = document.createElement("div");
  circle.className = CLASSES.CIRCLE;
  circle.dataset.commentId = comment.id;
  circle.dataset.commentText = comment.text;
  circle.setAttribute("role", "button");
  circle.setAttribute("tabindex", "0");
  circle.setAttribute("aria-label", `Comment: ${comment.text}`);

  // Basic positioning - will be updated by position validation system
  circle.style.cssText = `
        position: absolute;
        pointer-events: auto;
    `;

  return circle;
};

const createScreenshotsDisplay = (screenshots) => {
  const container = document.createElement("div");
  container.className = CLASSES.SCREENSHOTS_CONTAINER;
  container.classList.add(CLASSES.ACTIVE);

  screenshots.forEach((src) => {
    const item = document.createElement("div");
    item.className = CLASSES.SCREENSHOT_ITEM;

    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = src;
    img.alt = "Attached screenshot";

    item.appendChild(img);
    container.appendChild(item);
  });

  return container;
};

export const createTooltip = (comment) => {
  const tooltip = document.createElement("div");
  tooltip.className = CLASSES.TOOLTIP;
  tooltip.dataset.for = comment.id;
  tooltip.setAttribute("role", "dialog");
  tooltip.setAttribute("aria-label", "Comment preview");

  const header = document.createElement("div");
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(comment.author, comment.createdAt);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = "&times;";

  header.appendChild(meta);
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = CLASSES.THREAD_BODY;
  body.textContent = comment.text;

  tooltip.appendChild(header);
  tooltip.appendChild(body);
  const tooltipScreenshots =
    comment.screenshots || (comment.screenshot ? [comment.screenshot] : []);
  if (tooltipScreenshots.length > 0) {
    tooltip.appendChild(createScreenshotsDisplay(tooltipScreenshots));
  }
  return tooltip;
};

export const createReplyElement = (reply) => {
  const replyEl = document.createElement("div");
  replyEl.className = CLASSES.THREAD_REPLY;

  const meta = createMetaElement(reply.author, reply.timestamp);
  const text = document.createElement("div");
  text.className = CLASSES.THREAD_BODY;
  text.textContent = reply.text;

  replyEl.appendChild(meta);
  replyEl.appendChild(text);
  const replyScreenshots =
    reply.screenshots || (reply.screenshot ? [reply.screenshot] : []);
  if (replyScreenshots.length > 0) {
    replyEl.appendChild(createScreenshotsDisplay(replyScreenshots));
  }
  return replyEl;
};

export const createThreadPopover = (comment) => {
  const popover = document.createElement("div");
  popover.className = CLASSES.THREAD_POPOVER;
  popover.dataset.for = comment.id;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Comment thread");

  const header = document.createElement("div");
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(comment.author, comment.createdAt);
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = "&times;";

  header.appendChild(meta);
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = CLASSES.THREAD_BODY;
  body.textContent = comment.text;

  const replies = document.createElement("div");
  replies.className = CLASSES.THREAD_REPLIES;
  if (comment.replies) {
    comment.replies.forEach((reply) => {
      replies.appendChild(createReplyElement(reply));
    });
  }

  const { container: inputArea } = createInputArea({
    areaClassName: CLASSES.THREAD_INPUT_AREA,
    inputTag: "input",
    inputClassName: CLASSES.THREAD_INPUT,
    inputPlaceholder: "Reply...",
  });

  popover.appendChild(header);
  popover.appendChild(body);
  const popoverScreenshots =
    comment.screenshots || (comment.screenshot ? [comment.screenshot] : []);
  if (popoverScreenshots.length > 0) {
    popover.appendChild(createScreenshotsDisplay(popoverScreenshots));
  }
  popover.appendChild(replies);
  popover.appendChild(inputArea);

  return popover;
};
