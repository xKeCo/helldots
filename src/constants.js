export const CLASSES = {
  CIRCLE: "comment-circle",
  CIRCLE_WRAPPER: "comment-circle-wrapper",
  TOOLTIP: "comment-tooltip",
  TOOLBAR_TEXT: "toolbar-text",
  SHORTCUT_HINT: "shortcut-hint",
  COMMENT_INPUT_AREA: "comment-input-area",
  CLOSE_TOOLTIP: "close-tooltip",
  ACTIVE: "active",
  COMMENT_CURSOR: "comment-cursor",
  COMMENT_OVERLAY: "comment-overlay",
  THREAD_POPOVER: "comment-thread-popover",
  THREAD_HEADER: "thread-header",
  THREAD_BODY: "thread-body",
  THREAD_REPLIES: "thread-replies",
  THREAD_REPLY: "thread-reply",
  THREAD_INPUT_AREA: "thread-input-area",
  THREAD_INPUT: "thread-input",
  THREAD_SUBMIT: "thread-submit",
  THREAD_META: "thread-meta",
  THREAD_AUTHOR: "thread-author",
  THREAD_TIME: "thread-time",
  PREVIEW_CIRCLE: "preview-circle",
  SELECTION_RECT: "selection-rect",
  SCREENSHOT_IMG: "screenshot-img",
  SCREENSHOT_REMOVE: "screenshot-remove",
  SCREENSHOTS_CONTAINER: "screenshots-container",
  SCREENSHOT_ITEM: "screenshot-item",
  LIGHTBOX: "helldots-lightbox",
  LIGHTBOX_IMG: "helldots-lightbox-img",
  LIGHTBOX_CLOSE: "helldots-lightbox-close",
  COMMENT_ACTIONS_BAR: "comment-actions-bar",
  ATTACH_IMAGE_BTN: "attach-image-btn",
  TOOLBAR_ACTIONS: "toolbar-actions",
  TOOLBAR_ACTION_BTN: "toolbar-action-btn",
  TOOLBAR_ACTION_WRAPPER: "toolbar-action-wrapper",
  TOOLBAR_ACTION_TOOLTIP: "toolbar-action-tooltip",
  TOOLBAR_COMMENT_BTN: "toolbar-comment-btn",
  TOOLBAR_MENU_BTN: "toolbar-menu-btn",
  INBOX_PANEL: "inbox-panel",
  INBOX_HEADER: "inbox-header",
  INBOX_FILTER: "inbox-filter",
  INBOX_FILTER_MENU: "inbox-filter-menu",
  INBOX_FILTER_OPTION: "inbox-filter-option",
  INBOX_FILTER_SECTION: "inbox-filter-section",
  INBOX_CLOSE: "inbox-close",
  INBOX_LIST: "inbox-list",
  INBOX_CARD: "inbox-card",
  INBOX_CARD_HEADER: "inbox-card-header",
  INBOX_CARD_ACTIONS: "inbox-card-actions",
  INBOX_CARD_TEXT: "inbox-card-text",
  INBOX_CARD_TAG: "inbox-card-tag",
  INBOX_CARD_REPLY_LINK: "inbox-card-reply-link",
  INBOX_ACTION_BTN: "inbox-action-btn",
  INBOX_STATUS_DOT: "inbox-status-dot",
  INBOX_MENU: "inbox-menu",
  INBOX_MENU_ITEM: "inbox-menu-item",
  INBOX_DETAIL: "inbox-detail",
  INBOX_DETAIL_HEADER: "inbox-detail-header",
  INBOX_BACK: "inbox-back",
  INBOX_NAV_BTN: "inbox-nav-btn",
  INBOX_REPLIES: "inbox-replies",
  INBOX_EMPTY: "inbox-empty",
  HIGHLIGHT: "helldots-highlight",
};

export const IDS = {
  TOOLBAR: "comment-toolbar",
  COMMENT_BOX: "comment-box",
  COMMENT_INPUT: "comment-input",
  SUBMIT_COMMENT: "submit-comment",
  STYLES: "comment-overlay-styles",
  GLOBAL_STYLES: "comment-overlay-global-styles",
  ATTACH_IMAGE_INPUT: "attach-image-input",
};

// RF09 — comment lifecycle. Order matters: it's the order shown in the
// status picker menu.
export const STATUSES = ["open", "in_progress", "resolved"];

export const STATUS_COLORS = {
  open: "#2E90FA",
  in_progress: "#FF9F0A",
  resolved: "#30D158",
};

export const SELECTORS = {
  CONTAINER: 'section, div[class*="container"], div[class*="content"]',
};

export const Z_INDEX = {
  CIRCLE: 9997,
  TOOLTIP: 10000,
  TOOLBAR: 9998,
  COMMENT_BOX: 9999,
  LIGHTBOX: 10001,
};

export const CURSOR_SVG = `data:image/svg+xml;utf8,<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(%23filter0_d_4_97)"><path d="M6 8C6 6.89543 6.89543 6 8 6H20C27.732 6 34 12.268 34 20V20C34 27.732 27.732 34 20 34V34C12.268 34 6 27.732 6 20V8Z" fill="%232E90FA"/><path d="M8 7H20C27.1797 7 33 12.8203 33 20C33 27.1797 27.1797 33 20 33C12.8203 33 7 27.1797 7 20V8C7 7.44772 7.44772 7 8 7Z" stroke="white" stroke-width="2"/></g><filter id="filter0_d_4_97" x="0" y="0" width="48" height="48" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dx="4" dy="4"/><feGaussianBlur stdDeviation="5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0.180392 0 0 0 0 0.564706 0 0 0 0 0.980392 0 0 0 0.16 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_97"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_97" result="shape"/></filter></svg>`;
