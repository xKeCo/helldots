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

/**
 * Shared input area component used by both the comment box and the thread popover.
 * Returns the container element and references to key child elements.
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

  const inputEl = document.createElement(inputTag);
  if (inputId) inputEl.id = inputId;
  if (inputClassName) inputEl.className = inputClassName;
  inputEl.placeholder = inputPlaceholder;
  if (inputTag === "input") inputEl.type = "text";

  const screenshotPreview = document.createElement("div");
  screenshotPreview.className = CLASSES.SCREENSHOT_PREVIEW;

  const screenshotImg = document.createElement("img");
  screenshotImg.className = CLASSES.SCREENSHOT_IMG;

  const screenshotRemove = document.createElement("button");
  screenshotRemove.className = CLASSES.SCREENSHOT_REMOVE;
  screenshotRemove.innerHTML = "&times;";

  screenshotPreview.appendChild(screenshotImg);
  screenshotPreview.appendChild(screenshotRemove);

  const actionsBar = document.createElement("div");
  actionsBar.className = CLASSES.COMMENT_ACTIONS_BAR;

  const attachBtn = document.createElement("button");
  attachBtn.className = CLASSES.ATTACH_IMAGE_BTN;
  attachBtn.type = "button";
  attachBtn.innerHTML = ATTACH_ICON_SVG;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  if (fileInputId) fileInput.id = fileInputId;
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  const submitBtn = document.createElement("button");
  if (submitBtnId) submitBtn.id = submitBtnId;
  submitBtn.className = CLASSES.THREAD_SUBMIT;
  submitBtn.innerHTML = SEND_ICON_SVG;

  actionsBar.appendChild(attachBtn);
  actionsBar.appendChild(fileInput);
  actionsBar.appendChild(submitBtn);

  container.appendChild(inputEl);
  container.appendChild(screenshotPreview);
  container.appendChild(actionsBar);

  return {
    container,
    inputEl,
    screenshotPreview,
    screenshotImg,
    screenshotRemove,
    attachBtn,
    fileInput,
    submitBtn,
  };
};

export const createToolbar = (options = {}) => {
  const toolbar = document.createElement("div");
  toolbar.id = IDS.TOOLBAR;
  toolbar.innerHTML = `
        <div class="${CLASSES.TOOLBAR_CONTENT}">
            <span class="${CLASSES.TOOLBAR_TEXT}">Comment</span>
            <span class="${CLASSES.SHORTCUT_HINT}">${getShortcutText(
    options
  )}</span>
        </div>
    `;
  return toolbar;
};

export const createCommentBox = () => {
  const commentBox = document.createElement("div");
  commentBox.id = IDS.COMMENT_BOX;

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

  // Basic positioning - will be updated by position validation system
  circle.style.cssText = `
        position: absolute;
        pointer-events: auto;
    `;

  return circle;
};

export const createTooltip = (comment) => {
  const tooltip = document.createElement("div");
  tooltip.className = CLASSES.TOOLTIP;
  tooltip.dataset.for = comment.id;

  const header = document.createElement("div");
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(comment.author, comment.createdAt);
  const closeButton = document.createElement("span");
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.innerHTML = "&times;";

  header.appendChild(meta);
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = CLASSES.THREAD_BODY;
  body.textContent = comment.text;

  tooltip.appendChild(header);
  tooltip.appendChild(body);
  if (comment.screenshot) {
    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = comment.screenshot;
    tooltip.appendChild(img);
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
  if (reply.screenshot) {
    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = reply.screenshot;
    replyEl.appendChild(img);
  }
  return replyEl;
};

export const createThreadPopover = (comment) => {
  const popover = document.createElement("div");
  popover.className = CLASSES.THREAD_POPOVER;
  popover.dataset.for = comment.id;

  const header = document.createElement("div");
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(comment.author, comment.createdAt);
  const closeButton = document.createElement("span");
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
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
  if (comment.screenshot) {
    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = comment.screenshot;
    popover.appendChild(img);
  }
  popover.appendChild(replies);
  popover.appendChild(inputArea);

  return popover;
};
