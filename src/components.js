import {
  CLASSES,
  IDS,
  COMMENT_TYPES,
  TYPE_COLORS,
  PRIORITIES,
  PRIORITY_COLORS,
  STATUS_COLORS,
  MAX_SCREENSHOTS,
} from "./constants.js";
import { formatDuration, formatTemplate } from "./i18n.js";
import { currentResolutionMs } from "./audit.js";
import defaultStrings from "./locales/en.js";
import {
  createPicker,
  createMoreMenu,
  statusLabelOf,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import { createInlineEditor } from "./inline-editor.js";

const formatRelativeTime = (date, strings) => {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return strings.justNow;
  if (minutes < 60) return formatTemplate(strings.minutesAgoTemplate, minutes);
  if (hours < 24) return formatTemplate(strings.hoursAgoTemplate, hours);
  return formatTemplate(strings.daysAgoTemplate, days);
};

const formatFullDate = (date, locale) => {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
};

export const createMetaElement = (
  author,
  createdAt,
  strings,
  locale,
  editedAt = null
) => {
  const meta = document.createElement("div");
  meta.className = CLASSES.THREAD_META;

  const authorEl = document.createElement("span");
  authorEl.className = CLASSES.THREAD_AUTHOR;
  authorEl.textContent = author || strings.anonymous;

  const timeEl = document.createElement("span");
  timeEl.className = CLASSES.THREAD_TIME;
  timeEl.textContent = formatRelativeTime(createdAt, strings);
  timeEl.dataset.fullDate = formatFullDate(createdAt, locale);

  meta.appendChild(authorEl);
  meta.appendChild(timeEl);

  if (editedAt) meta.appendChild(createEditedMark(editedAt, strings, locale));

  return meta;
};

/**
 * The "edited" mark for a meta line.
 *
 * Someone can answer "the button is blue", watch the text they answered get
 * rewritten, and have no way to know it happened — their reply is left
 * arguing with a sentence that no longer exists. Text rather than a colour,
 * so it holds up under WCAG 1.4.1 like every other badge here, and the exact
 * time hangs off the same `data-full-date` hover the timestamp uses.
 *
 * Exported because the open thread popover is mutated in place rather than
 * re-rendered, so the overlay has to build this same mark after a save.
 *
 * @param {string} editedAt
 * @param {object} strings
 * @param {string} [locale]
 * @returns {HTMLElement}
 */
export const createEditedMark = (editedAt, strings, locale) => {
  const editedEl = document.createElement("span");
  editedEl.className = CLASSES.THREAD_EDITED;
  editedEl.textContent = strings.editedMark;
  editedEl.dataset.fullDate =
    strings.editedAtPrefix + formatFullDate(editedAt, locale);
  return editedEl;
};

export const isMacPlatform = () =>
  /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

/**
 * The comment shortcut as the user's platform spells it. Exported so the
 * inbox's empty state teaches the same chord the toolbar tooltip shows —
 * two different renderings of one shortcut is how they drift apart.
 * @param {{ shortcutModifier?: string, shortcutKey?: string }} options
 * @param {object} strings
 */
export const getShortcutText = (options, strings) => {
  const isMac = isMacPlatform();
  const modifierMap = {
    alt: isMac ? "⌥" : strings.modifierAlt,
    ctrl: isMac ? "⌘" : strings.modifierCtrl,
    shift: isMac ? "⇧" : strings.modifierShift,
  };

  const modifier = modifierMap[options.shortcutModifier] || modifierMap.alt;
  const key = options.shortcutKey?.toUpperCase() || "C";

  return `${modifier} + ${key}`;
};

// Shared with the inbox and the context block — one caret, not three copies.
export const CARET_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

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
 * @param {typeof defaultStrings} strings
 */
export const createInputArea = (
  {
    areaClassName,
    inputTag = "textarea",
    inputClassName,
    inputId,
    inputPlaceholder,
    submitBtnId,
    fileInputId,
  },
  strings
) => {
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
  attachBtn.setAttribute("aria-label", strings.attachImage);
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
  submitBtn.setAttribute("aria-label", strings.send);
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

export const createToolbar = (options = {}, strings = defaultStrings) => {
  const toolbar = document.createElement("div");
  toolbar.id = IDS.TOOLBAR;

  const actions = document.createElement("div");
  actions.className = CLASSES.TOOLBAR_ACTIONS;

  const commentLabel = document.createElement("span");
  commentLabel.className = CLASSES.TOOLBAR_TEXT;
  commentLabel.textContent = strings.toolbarComment;

  const shortcutKey = document.createElement("span");
  shortcutKey.className = CLASSES.SHORTCUT_HINT;
  shortcutKey.textContent = getShortcutText(options, strings);

  const commentWrapper = createActionWithTooltip(
    CLASSES.TOOLBAR_COMMENT_BTN,
    COMMENT_BUBBLE_SVG,
    [commentLabel, shortcutKey],
    strings.toolbarComment
  );
  commentWrapper
    .querySelector(`.${CLASSES.TOOLBAR_COMMENT_BTN}`)
    ?.setAttribute("aria-pressed", "false");

  const inboxLabel = document.createElement("span");
  inboxLabel.className = CLASSES.TOOLBAR_TEXT;
  inboxLabel.textContent = strings.toolbarInbox;

  const inboxWrapper = createActionWithTooltip(
    CLASSES.TOOLBAR_MENU_BTN,
    MENU_ICON_SVG,
    [inboxLabel],
    strings.toolbarInbox
  );

  actions.appendChild(commentWrapper);
  actions.appendChild(inboxWrapper);
  toolbar.appendChild(actions);

  return toolbar;
};

/**
 * RF3/RF4/RF5 — the classification and resolution-time badge strip. Every
 * badge carries text: colour alone must never be the only signal
 * (WCAG 1.4.1), so the colour only ever tints the border.
 *
 * Both flags exist because a badge is only worth showing where nothing else
 * already says it. The tooltip is a read-only preview and needs all of it.
 * Inbox cards carry labelled status/type/priority pickers, so repeating
 * those three as badges is pure duplication — but tags and the resolution
 * time have no control anywhere, so they stay either way.
 *
 * @param {any} comment
 * @param {object} strings
 * @param {{ includeStatus?: boolean, includeClassification?: boolean }} [options]
 * @returns {HTMLElement | null} null when there's nothing to show
 */
export const createBadgeRow = (
  comment,
  strings,
  { includeStatus = false, includeClassification = true } = {}
) => {
  const row = document.createElement("div");
  row.className = CLASSES.INBOX_BADGES;

  const addBadge = (text, modifier, color) => {
    const badge = document.createElement("span");
    badge.className = `${CLASSES.BADGE} ${modifier}`;
    badge.textContent = text;
    if (color) badge.style.borderColor = color;
    row.appendChild(badge);
  };

  if (includeStatus) {
    const status = comment.status || "open";
    addBadge(
      statusLabelOf(status, strings),
      CLASSES.BADGE_STATUS,
      STATUS_COLORS[status]
    );
  }
  if (includeClassification && comment.type) {
    addBadge(
      typeLabelOf(comment.type, strings),
      CLASSES.BADGE_TYPE,
      TYPE_COLORS[comment.type]
    );
  }
  if (includeClassification && comment.priority) {
    addBadge(
      priorityLabelOf(comment.priority, strings),
      CLASSES.BADGE_PRIORITY,
      PRIORITY_COLORS[comment.priority]
    );
  }
  // Tags are no longer authored in the widget, but comments saved before
  // that (or set through setCommentTags) still carry them.
  for (const tag of comment.tags || []) {
    addBadge(tag, CLASSES.BADGE_TAG, null);
  }

  if (comment.status === "resolved") {
    // Derived from the audit log rather than read off a stored figure, so a
    // reopened-and-resolved-again comment cannot show the duration of a
    // resolution that no longer applies. Comments predating the log fall back
    // to their stamp inside currentResolutionMs, and one with neither shows a
    // dash rather than a duration computed from data we do not have.
    const elapsedMs = currentResolutionMs(comment);
    const elapsed =
      elapsedMs === null ? "" : formatDuration(elapsedMs, strings);
    addBadge(
      formatTemplate(strings.resolvedInTemplate, elapsed || "—"),
      CLASSES.BADGE_DURATION,
      null
    );
  }

  return row.children.length ? row : null;
};

/**
 * RF3 + RF4 — the classification strip inside the new-comment box: type and
 * priority, both starting neutral.
 *
 * The comment box is built once and reused for every comment, so this
 * exposes reset(): without it the previous comment's selections would leak
 * into the next one.
 *
 * @param {object} strings
 * @returns {{ container: HTMLElement, getType: () => string|null,
 *   getPriority: () => string|null, reset: () => void }}
 */
export const createClassifyRow = (strings) => {
  const container = document.createElement("div");
  container.className = CLASSES.CLASSIFY_ROW;

  let type = null;
  let priority = null;

  // Pickers keep their selection internally, so returning them to neutral
  // means rebuilding them — hence mount() rather than a one-shot append.
  const mount = () => {
    container.replaceChildren();
    container.appendChild(
      createPicker({
        action: "type",
        options: [null, ...COMMENT_TYPES],
        value: null,
        colorOf: (value) => TYPE_COLORS[value] || "transparent",
        labelOf: (value) => typeLabelOf(value, strings),
        tooltipLabel: strings.typeLabel,
        onSelect: (value) => (type = value),
        showLabel: true,
      })
    );
    container.appendChild(
      createPicker({
        action: "priority",
        options: [null, ...PRIORITIES],
        value: null,
        colorOf: (value) => PRIORITY_COLORS[value] || "transparent",
        labelOf: (value) => priorityLabelOf(value, strings),
        tooltipLabel: strings.priorityLabel,
        onSelect: (value) => (priority = value),
        showLabel: true,
      })
    );
  };

  mount();

  return {
    container,
    getType: () => type,
    getPriority: () => priority,
    reset: () => {
      type = null;
      priority = null;
      mount();
    },
  };
};

export const createCommentBox = (strings = defaultStrings) => {
  const commentBox = document.createElement("div");
  commentBox.id = IDS.COMMENT_BOX;
  commentBox.setAttribute("role", "dialog");
  commentBox.setAttribute("aria-label", strings.commentBoxAriaLabel);

  const { container: inputArea } = createInputArea(
    {
      areaClassName: CLASSES.COMMENT_INPUT_AREA,
      inputTag: "textarea",
      inputId: IDS.COMMENT_INPUT,
      inputPlaceholder: strings.commentPlaceholder,
      submitBtnId: IDS.SUBMIT_COMMENT,
      fileInputId: IDS.ATTACH_IMAGE_INPUT,
    },
    strings
  );

  const classify = createClassifyRow(strings);

  commentBox.appendChild(classify.container);
  commentBox.appendChild(inputArea);
  commentBox.style.display = "none";
  // Exposed so the overlay can read the selections at save time without
  // re-querying the DOM.
  /** @type {any} */ (commentBox).classify = classify;
  return commentBox;
};

/**
 * Escapes a value for interpolation inside a double-quoted CSS attribute
 * selector. loadComments accepts arbitrary host ids, so a quote or backslash
 * in one would otherwise make every querySelector throw. Escaped by hand
 * because jsdom (where the whole test suite runs) does not implement
 * CSS.escape.
 * @param {string | number} value
 * @returns {string}
 */
export const cssAttrValue = (value) => String(value).replace(/[\\"]/g, "\\$&");

/**
 * Attribute selector for a comment's marker circle.
 * @param {string | number} id
 * @returns {string}
 */
export const circleSelector = (id) => `[data-comment-id="${cssAttrValue(id)}"]`;

/**
 * A comment's (or reply's) attached screenshots, tolerating the singular
 * `screenshot` field records persisted before the array existed still carry.
 * @param {{ screenshots?: string[], screenshot?: string }} entry
 * @returns {string[]}
 */
export const screenshotsOf = (entry) =>
  entry.screenshots || (entry.screenshot ? [entry.screenshot] : []);

/**
 * The pending-attachment preview strip. One builder for the three surfaces
 * that show it — comment box, thread popover reply, inbox reply — which had
 * drifted apart once already (the popover copy lost its remove button's
 * aria-label and type).
 * @param {Element} container
 * @param {string[]} screenshots the pending array; remove splices it in place
 * @param {{ strings: typeof defaultStrings, onShow: (dataUrl: string) => void,
 *   rerender: () => void }} deps
 */
export const renderScreenshotsPreview = (
  container,
  screenshots,
  { strings, onShow, rerender }
) => {
  container.innerHTML = "";
  container.classList.toggle(CLASSES.ACTIVE, screenshots.length > 0);

  screenshots.forEach((dataUrl, i) => {
    const item = document.createElement("div");
    item.className = CLASSES.SCREENSHOT_ITEM;

    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = dataUrl;
    img.alt = strings.attachedScreenshot;
    makeThumbnailOperable(img, () => onShow(dataUrl));

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = CLASSES.SCREENSHOT_REMOVE;
    removeBtn.setAttribute("aria-label", strings.removeScreenshot);
    removeBtn.innerHTML = "&times;";
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      screenshots.splice(i, 1);
      rerender();
    };

    item.appendChild(img);
    item.appendChild(removeBtn);
    container.appendChild(item);
  });
};

/**
 * FileReader as a promise, so the attachment path can await a host's
 * transform after the read without nesting two callbacks. Resolves to null
 * on a read error rather than rejecting — a file the browser could not read
 * is not an exception, it is just nothing to attach.
 * @param {File} file
 * @returns {Promise<string | null>}
 */
const readAsDataUrl = (file) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(/** @type {string} */ (ev.target.result));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

/**
 * Wires the hidden file input that feeds a pending-screenshots array,
 * enforcing MAX_SCREENSHOTS the same way on every attachment surface.
 * @param {HTMLInputElement} input
 * @param {() => string[]} getScreenshots
 * @param {() => void} rerender
 * @param {(dataUrl: string) => Promise<string>} [transform] the host's
 *   screenshot transform, with the comment id already bound by the caller.
 *   Omitted by the comment box, whose array is transformed at save instead.
 */
export const wireScreenshotInput = (
  input,
  getScreenshots,
  rerender,
  transform
) => {
  input.addEventListener("change", async (e) => {
    const file = /** @type {HTMLInputElement} */ (e.target).files[0];
    if (!file) return;
    // A non-image read into a data URL renders a broken <img> and bloats
    // the stored payload for nothing.
    if (file.type && !file.type.startsWith("image/")) return;
    if (getScreenshots().length >= MAX_SCREENSHOTS) return;

    const pending = readAsDataUrl(file);
    // Cleared while the read is in flight, exactly as before: otherwise
    // picking the same file twice in a row fires no second change event.
    input.value = "";
    const dataUrl = await pending;
    if (!dataUrl) return;

    const value = transform ? await transform(dataUrl) : dataUrl;

    // Re-checked after the awaits. The read has always sat here, and a
    // host's upload now sits here too — long enough for two quick picks to
    // both pass the check above and push past the cap together.
    const screenshots = getScreenshots();
    if (screenshots.length >= MAX_SCREENSHOTS) return;
    screenshots.push(value);
    rerender();
  });
};

/**
 * Every rendered screenshot thumbnail opens the lightbox the same way;
 * wired in one place so the five surfaces that render them cannot drift.
 * @param {ParentNode} root
 * @param {(src: string) => void} onShow
 */
export const wireScreenshotLightbox = (root, onShow) => {
  root
    .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
    .forEach((/** @type {HTMLImageElement} */ img) => {
      makeThumbnailOperable(img, () => onShow(img.src));
    });
};

/**
 * A thumbnail that opens the lightbox is a control, not decoration: same
 * role="button" + tabindex + Enter/Space pattern the marker circles use
 * (see DECISIONS.md, Accessibility). The img's alt is its accessible name.
 * @param {HTMLImageElement} img
 * @param {() => void} activate
 */
const makeThumbnailOperable = (img, activate) => {
  img.setAttribute("role", "button");
  img.setAttribute("tabindex", "0");
  img.addEventListener("click", (e) => {
    e.stopPropagation();
    activate();
  });
  img.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  });
};

export const createCommentCircle = (comment, strings = defaultStrings) => {
  const circle = document.createElement("div");
  circle.className = CLASSES.CIRCLE;
  circle.dataset.commentId = comment.id;
  circle.setAttribute("role", "button");
  circle.setAttribute("tabindex", "0");
  circle.setAttribute(
    "aria-label",
    `${strings.commentAriaLabelPrefix}${comment.text}`
  );

  // Basic positioning - will be updated by position validation system
  circle.style.cssText = `
        position: absolute;
        pointer-events: auto;
    `;

  return circle;
};

export const createScreenshotsDisplay = (screenshots, strings) => {
  const container = document.createElement("div");
  container.className = CLASSES.SCREENSHOTS_CONTAINER;
  container.classList.add(CLASSES.ACTIVE);

  screenshots.forEach((src) => {
    const item = document.createElement("div");
    item.className = CLASSES.SCREENSHOT_ITEM;

    const img = document.createElement("img");
    img.className = CLASSES.SCREENSHOT_IMG;
    img.src = src;
    img.alt = strings.attachedScreenshot;

    item.appendChild(img);
    container.appendChild(item);
  });

  return container;
};

export const createTooltip = (comment, strings = defaultStrings, locale) => {
  const tooltip = document.createElement("div");
  tooltip.className = CLASSES.TOOLTIP;
  tooltip.dataset.for = comment.id;
  tooltip.setAttribute("role", "dialog");
  tooltip.setAttribute("aria-label", strings.tooltipAriaLabel);

  const header = document.createElement("div");
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(
    comment.author,
    comment.createdAt,
    strings,
    locale,
    comment.editedAt
  );
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.setAttribute("aria-label", strings.close);
  closeButton.innerHTML = "&times;";

  header.appendChild(meta);
  header.appendChild(closeButton);

  const body = document.createElement("div");
  body.className = CLASSES.THREAD_BODY;
  body.textContent = comment.text;

  tooltip.appendChild(header);
  tooltip.appendChild(body);
  // The tooltip is a read-only preview with no pickers, so the badges are
  // the only place its status/type/priority can be read at all.
  const badges = createBadgeRow(comment, strings, { includeStatus: true });
  if (badges) tooltip.appendChild(badges);
  const tooltipScreenshots = screenshotsOf(comment);
  if (tooltipScreenshots.length > 0) {
    tooltip.appendChild(createScreenshotsDisplay(tooltipScreenshots, strings));
  }

  // The preview shows the root comment only, so a thread with replies would
  // otherwise look like a lone remark. Omitted at zero rather than shown as
  // "0 replies": absence already says it, and a count of nothing is noise.
  const replyCount = comment.replies?.length || 0;
  if (replyCount > 0) {
    const replies = document.createElement("div");
    replies.className = CLASSES.TOOLTIP_REPLY_COUNT;
    replies.textContent =
      replyCount === 1
        ? strings.replyCountOne
        : formatTemplate(strings.replyCountTemplate, replyCount);
    tooltip.appendChild(replies);
  }

  return tooltip;
};

/**
 * One reply inside a thread. `onDelete` and `onEdit` are optional so
 * read-only renderings (and any host that never wires them) keep the plain
 * row: the ⋯ menu is only built when there is something for it to do.
 *
 * `editing`, when present, replaces the body with the inline editor. The
 * draft it renders belongs to the caller — see `inline-editor.js` for why.
 *
 * `reactions`, when present, is the thread's reaction UI: it puts the palette
 * trigger on the meta line, next to the ⋯, and the pill row under the text.
 * Optional for the same reason as the handlers above: a caller that never
 * wires it gets the plain row rather than controls that do nothing.
 *
 * @param {any} reply
 * @param {object} [strings]
 * @param {string} [locale]
 * @param {{
 *   onDelete?: (reply: any, replyEl: HTMLElement) => void,
 *   onEdit?: (reply: any) => void,
 *   editing?: {
 *     draft: string,
 *     onInput: (text: string) => void,
 *     onSave: (text: string) => void,
 *     onCancel: () => void,
 *   } | null,
 *   reactions?: import("./reactions.js").ReactionsUi | null,
 * }} [handlers]
 */
export const createReplyElement = (
  reply,
  strings = defaultStrings,
  locale,
  { onDelete, onEdit, editing = null, reactions = null } = {}
) => {
  const replyEl = document.createElement("div");
  replyEl.className = CLASSES.THREAD_REPLY;
  // The popover is built once and mutated in place, so anything that has to
  // find one reply again later — the editor, a text refresh — needs a handle.
  replyEl.dataset.replyId = String(reply.id);

  const meta = createMetaElement(
    reply.author,
    reply.timestamp,
    strings,
    locale,
    reply.editedAt
  );

  // Same ⋯ builder the comment strip uses, so a reply is edited and deleted
  // through the control the user already learned one level up.
  const items = [];
  if (onEdit) {
    items.push({ label: strings.editReply, onSelect: () => onEdit(reply) });
  }
  if (onDelete) {
    items.push({
      label: strings.deleteReply,
      onSelect: () => onDelete(reply, replyEl),
      confirm: () => ({
        title: strings.confirmDeleteReplyTitle,
        message: strings.confirmDeleteReplyMessage,
        confirmLabel: strings.confirmDelete,
        cancelLabel: strings.confirmCancel,
      }),
    });
  }
  // The reply's own tools, mirroring the comment's action row one level down:
  // react, then the ⋯. Wrapped so `margin-left: auto` pushes the pair right
  // as one unit instead of only the first of them.
  const replyTools = document.createElement("div");
  replyTools.className = `${CLASSES.ACTIONS_GROUP} ${CLASSES.THREAD_REPLY_ACTIONS}`;
  if (reactions) {
    replyTools.appendChild(
      reactions.trigger(reply, { className: CLASSES.INBOX_ACTION_BTN })
    );
  }
  if (items.length > 0) {
    replyTools.appendChild(
      createMoreMenu({ label: strings.replyOptions, items })
    );
  }
  if (replyTools.children.length > 0) meta.appendChild(replyTools);

  let text;
  if (editing) {
    text = createInlineEditor({
      value: editing.draft,
      strings,
      onInput: editing.onInput,
      onSave: editing.onSave,
      onCancel: editing.onCancel,
    });
  } else {
    text = document.createElement("div");
    text.className = CLASSES.THREAD_BODY;
    text.textContent = reply.text;
  }

  replyEl.appendChild(meta);
  replyEl.appendChild(text);
  const replyScreenshots = screenshotsOf(reply);
  if (replyScreenshots.length > 0) {
    replyEl.appendChild(createScreenshotsDisplay(replyScreenshots, strings));
  }
  // Last child of the block it belongs to — after the text and after the
  // thumbnails. One rule, every surface.
  if (reactions) replyEl.appendChild(reactions.bar(reply));
  return replyEl;
};

/**
 * @param {any} comment
 * @param {object} [strings]
 * @param {string} [locale]
 * @param {{
 *   onDeleteReply?: (reply: any, replyEl: HTMLElement) => void,
 *   onEditReply?: (reply: any) => void,
 *   reactions?: import("./reactions.js").ReactionsUi | null,
 * }} [handlers]
 */
export const createThreadPopover = (
  comment,
  strings = defaultStrings,
  locale,
  { onDeleteReply, onEditReply, reactions = null } = {}
) => {
  const popover = document.createElement("div");
  popover.className = CLASSES.THREAD_POPOVER;
  popover.dataset.for = comment.id;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", strings.popoverAriaLabel);

  const header = document.createElement("div");
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(
    comment.author,
    comment.createdAt,
    strings,
    locale,
    comment.editedAt
  );
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.setAttribute("aria-label", strings.close);
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
      replies.appendChild(
        createReplyElement(reply, strings, locale, {
          onDelete: onDeleteReply,
          onEdit: onEditReply,
          reactions,
        })
      );
    });
  }

  const { container: inputArea } = createInputArea(
    {
      areaClassName: CLASSES.THREAD_INPUT_AREA,
      inputTag: "input",
      inputClassName: CLASSES.THREAD_INPUT,
      inputPlaceholder: strings.replyPlaceholder,
    },
    strings
  );

  // The header (and the action row the overlay inserts after it) and the
  // reply box stay put; everything between them scrolls. Without this the
  // popover just grew past the viewport — expanding the context block or
  // adding replies made content unreachable, because the wheel event fell
  // through to the page.
  const scroll = document.createElement("div");
  scroll.className = CLASSES.THREAD_SCROLL;

  popover.appendChild(header);
  scroll.appendChild(body);
  const popoverScreenshots = screenshotsOf(comment);
  if (popoverScreenshots.length > 0) {
    scroll.appendChild(createScreenshotsDisplay(popoverScreenshots, strings));
  }
  // The root comment's own bar, before the replies: it belongs to the text
  // above it, not to the conversation below.
  if (reactions) scroll.appendChild(reactions.bar(comment));
  scroll.appendChild(replies);
  popover.appendChild(scroll);
  popover.appendChild(inputArea);

  return popover;
};
