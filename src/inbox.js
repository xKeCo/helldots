// Right-side inbox sidebar: a filterable list of every comment and a detail
// view with the full thread. Pure view layer — all data mutations flow back
// to CommentOverlay through the callbacks contract passed to the
// constructor, so this module never touches storage or the page markers.

import { CLASSES } from "./constants.js";
import { buildAgentContext } from "./agent-context.js";
import {
  createMetaElement,
  createScreenshotsDisplay,
  createInputArea,
  createReplyElement,
} from "./components.js";

const COPY_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const DOTS_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`;
const CARET_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const CHEVRON_LEFT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ARROW_UP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const ARROW_DOWN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const copyToClipboard = (text) => {
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

export class InboxView {
  /**
   * @param {Object} deps
   * @param {ShadowRoot} deps.shadowRoot
   * @param {Object} deps.strings
   * @param {string} deps.locale
   * @param {string} deps.currentPage
   * @param {() => Array<Object>} deps.getComments
   * @param {{ onOpenDetailScroll: Function, onReply: Function, onDelete: Function, onShowLightbox: Function, onClose: Function }} deps.callbacks
   */
  constructor({
    shadowRoot,
    strings,
    locale,
    currentPage,
    getComments,
    callbacks,
  }) {
    this.shadowRoot = shadowRoot;
    this.strings = strings;
    this.locale = locale;
    this.currentPage = currentPage;
    this.getComments = getComments;
    this.callbacks = callbacks;
    this.filter = "page";
    this.detailId = null;
    /** @type {HTMLElement | null} */
    this.el = null;
  }

  isOpen() {
    return Boolean(this.el);
  }

  open() {
    if (this.el) return;
    this.el = document.createElement("div");
    this.el.className = CLASSES.INBOX_PANEL;
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", this.strings.inboxAriaLabel);
    this.shadowRoot.appendChild(this.el);
    this.render();
  }

  close() {
    this.el?.remove();
    this.el = null;
    this.detailId = null;
  }

  refresh() {
    if (this.el) this.render();
  }

  filteredComments() {
    const all = this.getComments();
    if (this.filter === "all") return all;
    return all.filter((comment) => comment.page === this.currentPage);
  }

  render() {
    if (!this.el) return;
    this.el.innerHTML = "";
    const comments = this.filteredComments();
    const detail =
      this.detailId != null
        ? comments.find((comment) => comment.id === this.detailId)
        : null;
    if (detail) {
      this._renderDetail(detail, comments);
    } else {
      this.detailId = null;
      this._renderList(comments);
    }
  }

  _openDetail(comment) {
    this.detailId = comment.id;
    if (comment.anchorState === "anchored" && !comment.hidden) {
      this.callbacks.onOpenDetailScroll(comment);
    }
    this.render();
  }

  _closeButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = CLASSES.INBOX_CLOSE;
    btn.setAttribute("aria-label", this.strings.close);
    btn.innerHTML = "&times;";
    btn.addEventListener("click", () => this.callbacks.onClose());
    return btn;
  }

  _renderList(comments) {
    const header = document.createElement("div");
    header.className = CLASSES.INBOX_HEADER;
    header.appendChild(this._buildFilter());
    header.appendChild(this._closeButton());
    this.el.appendChild(header);

    const list = document.createElement("div");
    list.className = CLASSES.INBOX_LIST;
    this.el.appendChild(list);

    if (comments.length === 0) {
      const empty = document.createElement("div");
      empty.className = CLASSES.INBOX_EMPTY;
      empty.textContent = this.strings.inboxEmpty;
      list.appendChild(empty);
      return;
    }

    for (const comment of comments) {
      list.appendChild(this._buildCard(comment, { interactive: true }));
    }
  }

  _buildFilter() {
    const wrapper = document.createElement("div");
    wrapper.className = CLASSES.INBOX_FILTER + "-wrapper";

    const labelOf = (filter) =>
      filter === "all" ? this.strings.filterAll : this.strings.filterCurrentPage;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = CLASSES.INBOX_FILTER;
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span>${labelOf(this.filter)}</span>${CARET_ICON_SVG}`;

    const menu = document.createElement("div");
    menu.className = CLASSES.INBOX_FILTER_MENU;
    menu.style.display = "none";

    for (const filter of ["all", "page"]) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = CLASSES.INBOX_FILTER_OPTION;
      option.textContent = labelOf(filter);
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        this.filter = filter;
        this.render();
      });
      menu.appendChild(option);
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.style.display !== "none";
      menu.style.display = open ? "none" : "block";
      btn.setAttribute("aria-expanded", String(!open));
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(menu);
    return wrapper;
  }

  _buildCard(comment, { interactive }) {
    const card = document.createElement("div");
    card.className = CLASSES.INBOX_CARD;
    card.dataset.commentId = comment.id;

    const header = document.createElement("div");
    header.className = CLASSES.INBOX_CARD_HEADER;
    header.appendChild(
      createMetaElement(
        comment.author,
        comment.createdAt,
        this.strings,
        this.locale
      )
    );
    header.appendChild(this._buildCardActions(comment));
    card.appendChild(header);

    const text = document.createElement("div");
    text.className = CLASSES.INBOX_CARD_TEXT;
    text.textContent = comment.text;
    card.appendChild(text);

    if (comment.screenshots?.length) {
      const shots = createScreenshotsDisplay(comment.screenshots, this.strings);
      shots.querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`).forEach((img) => {
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          this.callbacks.onShowLightbox(img.src);
        });
      });
      card.appendChild(shots);
    }

    const tag = this._buildTag(comment);
    if (tag) card.appendChild(tag);

    if (interactive) {
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      const replyLink = document.createElement("button");
      replyLink.type = "button";
      replyLink.className = CLASSES.INBOX_CARD_REPLY_LINK;
      replyLink.textContent = this.strings.replyLink;
      replyLink.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openDetail(comment);
      });
      card.appendChild(replyLink);

      card.addEventListener("click", () => this._openDetail(comment));
      card.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this._openDetail(comment);
        }
      });
    }

    return card;
  }

  _buildTag(comment) {
    let label = null;
    if (comment.anchorState === "orphaned") label = this.strings.orphanedBadge;
    else if (comment.hidden) label = this.strings.hiddenBadge;
    else if (comment.anchorState === "inactive") label = comment.page;
    if (!label) return null;

    const tag = document.createElement("span");
    tag.className = CLASSES.INBOX_CARD_TAG;
    tag.textContent = label;
    return tag;
  }

  _buildCardActions(comment) {
    const actions = document.createElement("div");
    actions.className = CLASSES.INBOX_CARD_ACTIONS;

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = CLASSES.INBOX_ACTION_BTN;
    copyBtn.dataset.action = "copy";
    copyBtn.setAttribute("aria-label", this.strings.copyAgentContext);
    copyBtn.title = this.strings.copyAgentContext;
    copyBtn.innerHTML = COPY_ICON_SVG;
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(
        buildAgentContext(comment, {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        })
      );
      copyBtn.innerHTML = CHECK_ICON_SVG;
      copyBtn.title = this.strings.copied;
      setTimeout(() => {
        copyBtn.innerHTML = COPY_ICON_SVG;
        copyBtn.title = this.strings.copyAgentContext;
      }, 1500);
    });
    actions.appendChild(copyBtn);

    // Status workflow lands later — the dot is a visual placeholder only.
    const statusDot = document.createElement("span");
    statusDot.className = CLASSES.INBOX_STATUS_DOT;
    statusDot.title = this.strings.statusLabel;
    actions.appendChild(statusDot);

    const menuWrapper = document.createElement("div");
    menuWrapper.style.position = "relative";

    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = CLASSES.INBOX_ACTION_BTN;
    menuBtn.dataset.action = "menu";
    menuBtn.setAttribute("aria-label", this.strings.commentOptions);
    menuBtn.title = this.strings.commentOptions;
    menuBtn.innerHTML = DOTS_ICON_SVG;

    const menu = document.createElement("div");
    menu.className = CLASSES.INBOX_MENU;
    menu.style.display = "none";

    const deleteItem = document.createElement("button");
    deleteItem.type = "button";
    deleteItem.className = CLASSES.INBOX_MENU_ITEM;
    deleteItem.textContent = this.strings.deleteComment;
    deleteItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.detailId === comment.id) this.detailId = null;
      this.callbacks.onDelete(comment.id);
      this.render();
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
  }

  _renderDetail(comment, comments) {
    const index = comments.indexOf(comment);

    const header = document.createElement("div");
    header.className = CLASSES.INBOX_DETAIL_HEADER;

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = CLASSES.INBOX_BACK;
    backBtn.innerHTML = `${CHEVRON_LEFT_SVG}<span>${this.strings.back}</span>`;
    backBtn.addEventListener("click", () => {
      this.detailId = null;
      this.render();
    });
    header.appendChild(backBtn);

    const nav = document.createElement("div");
    nav.className = CLASSES.INBOX_CARD_ACTIONS;

    const navBtn = (svg, label, targetIndex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = CLASSES.INBOX_NAV_BTN;
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.innerHTML = svg;
      const target = comments[targetIndex];
      btn.disabled = !target;
      if (target) {
        btn.addEventListener("click", () => this._openDetail(target));
      }
      return btn;
    };

    nav.appendChild(navBtn(ARROW_UP_SVG, this.strings.prevComment, index - 1));
    nav.appendChild(
      navBtn(ARROW_DOWN_SVG, this.strings.nextComment, index + 1)
    );
    nav.appendChild(this._closeButton());
    header.appendChild(nav);

    this.el.appendChild(header);

    const detail = document.createElement("div");
    detail.className = CLASSES.INBOX_DETAIL;

    detail.appendChild(this._buildCard(comment, { interactive: false }));

    const replies = document.createElement("div");
    replies.className = CLASSES.INBOX_REPLIES;
    for (const reply of comment.replies || []) {
      const replyEl = createReplyElement(reply, this.strings, this.locale);
      replyEl.querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`).forEach((img) => {
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          this.callbacks.onShowLightbox(img.src);
        });
      });
      replies.appendChild(replyEl);
    }
    detail.appendChild(replies);

    detail.appendChild(this._buildReplyInput(comment));
    this.el.appendChild(detail);
  }

  _buildReplyInput(comment) {
    const {
      container,
      inputEl,
      screenshotsContainer,
      attachBtn,
      fileInput,
      submitBtn,
    } = createInputArea(
      {
        areaClassName: CLASSES.THREAD_INPUT_AREA,
        inputTag: "input",
        inputClassName: CLASSES.THREAD_INPUT,
        inputPlaceholder: this.strings.replyPlaceholder,
      },
      this.strings
    );

    let pendingScreenshots = [];

    const updatePreview = () => {
      screenshotsContainer.innerHTML = "";
      screenshotsContainer.classList.toggle(
        CLASSES.ACTIVE,
        pendingScreenshots.length > 0
      );
      pendingScreenshots.forEach((dataUrl, i) => {
        const item = document.createElement("div");
        item.className = CLASSES.SCREENSHOT_ITEM;
        const img = document.createElement("img");
        img.className = CLASSES.SCREENSHOT_IMG;
        img.src = dataUrl;
        img.alt = this.strings.attachedScreenshot;
        img.onclick = () => this.callbacks.onShowLightbox(dataUrl);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = CLASSES.SCREENSHOT_REMOVE;
        removeBtn.setAttribute("aria-label", this.strings.removeScreenshot);
        removeBtn.innerHTML = "&times;";
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          pendingScreenshots.splice(i, 1);
          updatePreview();
        };
        item.appendChild(img);
        item.appendChild(removeBtn);
        screenshotsContainer.appendChild(item);
      });
    };

    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = /** @type {HTMLInputElement} */ (e.target).files[0];
      if (!file || pendingScreenshots.length >= 5) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingScreenshots.push(ev.target.result);
        updatePreview();
      };
      reader.readAsDataURL(file);
      fileInput.value = "";
    });

    const submit = () => {
      const text = inputEl.value.trim();
      if (!text && pendingScreenshots.length === 0) return;
      this.callbacks.onReply(comment, text, [...pendingScreenshots]);
      pendingScreenshots = [];
      this.render();
    };

    submitBtn.addEventListener("click", submit);
    inputEl.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });

    return container;
  }
}
