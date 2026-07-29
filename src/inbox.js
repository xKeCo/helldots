// Right-side inbox sidebar: a filterable list of every comment and a detail
// view with the full thread. Pure view layer — all data mutations flow back
// to CommentOverlay through the callbacks contract passed to the
// constructor, so this module never touches storage or the page markers.

import {
  CLASSES,
  TYPE_COLORS,
  PRIORITY_COLORS,
  COMMENT_TYPES,
  PRIORITIES,
} from "./constants.js";
import { buildAgentContext } from "./agent-context.js";
import { formatDuration, formatTemplate } from "./i18n.js";
import {
  createCommentActions,
  copyToClipboard,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import {
  createMetaElement,
  createScreenshotsDisplay,
  createInputArea,
  createReplyElement,
} from "./components.js";

const CARET_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const CHEVRON_LEFT_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
const ARROW_UP_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
const ARROW_DOWN_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

export class InboxView {
  /**
   * @param {Object} deps
   * @param {ShadowRoot} deps.shadowRoot
   * @param {Object} deps.strings
   * @param {string} deps.locale
   * @param {string} deps.currentPage
   * @param {() => Array<Object>} deps.getComments
   * @param {{ onOpenDetailScroll: Function, onReply: Function, onDelete: Function, onSetStatus: Function, onSetType: Function, onSetPriority: Function, onNavigateToPage: Function, onShowLightbox: Function, onClose: Function }} deps.callbacks
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
    this.pageFilter = "page"; // "all" | "page"
    this.statusFilter = "all"; // "all" | "unresolved" | "resolved"
    this.typeFilter = "all"; // "all" | COMMENT_TYPES
    this.priorityFilter = "all"; // "all" | PRIORITIES
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
    this._clearHighlight();
    this.el?.remove();
    this.el = null;
    this.detailId = null;
  }

  refresh() {
    if (this.el) this.render();
  }

  _highlight(comment) {
    this._clearHighlight();
    if (
      comment.anchorState !== "anchored" ||
      comment.hidden ||
      comment.status === "resolved"
    ) {
      return;
    }
    const circle = this.shadowRoot.querySelector(
      `[data-comment-id="${comment.id}"]`
    );
    if (!circle) return;
    circle.classList.add(CLASSES.HIGHLIGHT);
    this._highlightedEl = circle;
  }

  _clearHighlight() {
    this._highlightedEl?.classList.remove(CLASSES.HIGHLIGHT);
    this._highlightedEl = null;
  }

  filteredComments() {
    let comments = this.getComments();
    if (this.pageFilter === "page") {
      comments = comments.filter(
        (comment) => comment.page === this.currentPage
      );
    }
    if (this.statusFilter === "resolved") {
      comments = comments.filter((comment) => comment.status === "resolved");
    } else if (this.statusFilter === "unresolved") {
      comments = comments.filter((comment) => comment.status !== "resolved");
    }
    if (this.typeFilter !== "all") {
      comments = comments.filter((comment) => comment.type === this.typeFilter);
    }
    if (this.priorityFilter !== "all") {
      comments = comments.filter(
        (comment) => comment.priority === this.priorityFilter
      );
    }
    // Resolved sink to the bottom; both partitions keep their original order.
    return [
      ...comments.filter((comment) => comment.status !== "resolved"),
      ...comments.filter((comment) => comment.status === "resolved"),
    ];
  }

  render() {
    if (!this.el) return;
    this._clearHighlight();
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

  /**
   * Opens the panel (if needed) directly on a comment's detail. Used by
   * the overlay for the cross-page handoff on startup.
   * @param {number} id
   */
  openDetail(id) {
    if (!this.el) this.open();
    const comment = this.getComments().find((c) => c.id === id);
    if (comment) this._openDetail(comment);
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

  _pageFilterLabel(value) {
    return value === "all"
      ? this.strings.filterAll
      : this.strings.filterCurrentPage;
  }

  _statusFilterLabel(value) {
    if (value === "unresolved") return this.strings.filterUnresolved;
    if (value === "resolved") return this.strings.filterResolved;
    return this.strings.filterStatusAll;
  }

  /**
   * Summary label for the collapsed filter button. The page filter always
   * contributes (it's either "All" or "Current page"); status, type, and
   * priority only join in when active, so an active filter is never hidden
   * from a user who hasn't opened the menu.
   */
  _filterSummaryLabel() {
    const parts = [this._pageFilterLabel(this.pageFilter)];
    if (this.statusFilter !== "all") {
      parts.push(this._statusFilterLabel(this.statusFilter));
    }
    if (this.typeFilter !== "all") {
      parts.push(typeLabelOf(this.typeFilter, this.strings));
    }
    if (this.priorityFilter !== "all") {
      parts.push(priorityLabelOf(this.priorityFilter, this.strings));
    }
    return parts.join(" · ");
  }

  _buildFilter() {
    const wrapper = document.createElement("div");
    wrapper.className = CLASSES.INBOX_FILTER + "-wrapper";

    const label = this._filterSummaryLabel();

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = CLASSES.INBOX_FILTER;
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span>${label}</span>${CARET_ICON_SVG}`;

    const menu = document.createElement("div");
    menu.className = CLASSES.INBOX_FILTER_MENU;
    menu.style.display = "none";

    const addSection = (title) => {
      const section = document.createElement("div");
      section.className = CLASSES.INBOX_FILTER_SECTION;
      section.textContent = title;
      menu.appendChild(section);
    };

    const addOption = (text, checked, dataAttr, value, onSelect) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = CLASSES.INBOX_FILTER_OPTION;
      option.dataset[dataAttr] = value;
      option.setAttribute("role", "menuitemradio");
      option.setAttribute("aria-checked", String(checked));
      option.innerHTML = `<span>${text}</span>${checked ? "✓" : ""}`;
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect();
        this.render();
      });
      menu.appendChild(option);
    };

    addSection(this.strings.filterByPage);
    for (const value of ["all", "page"]) {
      addOption(
        this._pageFilterLabel(value),
        this.pageFilter === value,
        "filterPage",
        value,
        () => (this.pageFilter = value)
      );
    }

    addSection(this.strings.filterByStatus);
    for (const value of ["all", "unresolved", "resolved"]) {
      addOption(
        this._statusFilterLabel(value),
        this.statusFilter === value,
        "filterStatus",
        value,
        () => (this.statusFilter = value)
      );
    }

    addSection(this.strings.filterByType);
    for (const value of ["all", ...COMMENT_TYPES]) {
      addOption(
        value === "all"
          ? this.strings.filterStatusAll
          : typeLabelOf(value, this.strings),
        this.typeFilter === value,
        "filterType",
        value,
        () => (this.typeFilter = value)
      );
    }

    addSection(this.strings.filterByPriority);
    for (const value of ["all", ...PRIORITIES]) {
      addOption(
        value === "all"
          ? this.strings.filterStatusAll
          : priorityLabelOf(value, this.strings),
        this.priorityFilter === value,
        "filterPriority",
        value,
        () => (this.priorityFilter = value)
      );
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
    if (comment.status === "resolved") {
      card.classList.add(`${CLASSES.INBOX_CARD}--resolved`);
    }
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
      shots
        .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
        .forEach((/** @type {HTMLImageElement} */ img) => {
          img.addEventListener("click", (e) => {
            e.stopPropagation();
            this.callbacks.onShowLightbox(img.src);
          });
        });
      card.appendChild(shots);
    }

    const badges = this._buildBadges(comment);
    if (badges) card.appendChild(badges);

    const tag = this._buildTag(comment);
    if (tag) card.appendChild(tag);

    if (interactive) {
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");

      // Inactive comments belong to another page: activating them hands
      // off to that page (the detail opens there after the redirect).
      const activate = () =>
        comment.anchorState === "inactive"
          ? this.callbacks.onNavigateToPage(comment)
          : this._openDetail(comment);

      const replyLink = document.createElement("button");
      replyLink.type = "button";
      replyLink.className = CLASSES.INBOX_CARD_REPLY_LINK;
      replyLink.textContent = this.strings.replyLink;
      replyLink.addEventListener("click", (e) => {
        e.stopPropagation();
        activate();
      });
      card.appendChild(replyLink);

      card.addEventListener("click", activate);
      card.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });

      // Hovering a card spotlights its marker on the page — only when the
      // marker is actually there (anchored, visible, not resolved).
      card.addEventListener("mouseenter", () => this._highlight(comment));
      card.addEventListener("mouseleave", () => this._clearHighlight());
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

  /**
   * RF3/RF4/RF5 — classification and resolution-time badges. Every badge
   * carries text: colour alone must never be the only signal (WCAG 1.4.1).
   * @param {any} comment
   * @returns {HTMLElement | null} null when there's nothing to show
   */
  _buildBadges(comment) {
    const row = document.createElement("div");
    row.className = CLASSES.INBOX_BADGES;

    const addBadge = (text, modifier, color) => {
      const badge = document.createElement("span");
      badge.className = `${CLASSES.BADGE} ${modifier}`;
      badge.textContent = text;
      if (color) badge.style.borderColor = color;
      row.appendChild(badge);
    };

    if (comment.type) {
      addBadge(
        typeLabelOf(comment.type, this.strings),
        CLASSES.BADGE_TYPE,
        TYPE_COLORS[comment.type]
      );
    }
    if (comment.priority) {
      addBadge(
        priorityLabelOf(comment.priority, this.strings),
        CLASSES.BADGE_PRIORITY,
        PRIORITY_COLORS[comment.priority]
      );
    }
    for (const tag of comment.tags || []) {
      addBadge(tag, CLASSES.BADGE_TAG, null);
    }

    if (comment.status === "resolved") {
      // Comments resolved before RF5 shipped have no timestamp — show a
      // dash rather than a duration computed from data we don't have.
      const elapsed = comment.resolvedAt
        ? formatDuration(
            new Date(comment.resolvedAt).getTime() -
              new Date(comment.createdAt).getTime(),
            this.strings
          )
        : "";
      addBadge(
        formatTemplate(this.strings.resolvedInTemplate, elapsed || "—"),
        CLASSES.BADGE_DURATION,
        null
      );
    }

    return row.children.length ? row : null;
  }

  /**
   * RF2 — the environment the comment was reported from, plus the
   * automatic capture. Returns null for comments created before RF1/RF2.
   * @param {any} comment
   * @returns {HTMLElement | null}
   */
  _buildContextBlock(comment) {
    const { context, contextScreenshot } = comment;
    if (!context && !contextScreenshot) return null;

    const block = document.createElement("div");
    block.className = CLASSES.CONTEXT_BLOCK;

    const title = document.createElement("div");
    title.className = CLASSES.INBOX_FILTER_SECTION;
    title.textContent = this.strings.contextSection;
    block.appendChild(title);

    if (contextScreenshot) {
      const caption = document.createElement("div");
      caption.className = CLASSES.CONTEXT_SCREENSHOT_CAPTION;
      caption.textContent = this.strings.autoScreenshotLabel;
      block.appendChild(caption);

      const img = document.createElement("img");
      img.className = CLASSES.SCREENSHOT_IMG;
      img.src = contextScreenshot;
      img.alt = this.strings.autoScreenshotLabel;
      img.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onShowLightbox(contextScreenshot);
      });
      block.appendChild(img);
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
        block.appendChild(row);
      };

      const size = (dimensions) =>
        dimensions ? `${dimensions.width}×${dimensions.height}` : "";
      const named = (entry) =>
        entry?.name ? `${entry.name} ${entry.version || ""}`.trim() : "";

      addRow(this.strings.contextUrl, context.url);
      addRow(this.strings.contextViewport, size(context.viewport));
      addRow(this.strings.contextScreen, size(context.screen));
      addRow(this.strings.contextBrowser, named(context.browser));
      addRow(this.strings.contextOs, named(context.os));
    }

    return block;
  }

  _buildCardActions(comment) {
    return createCommentActions(comment, {
      strings: this.strings,
      onCopy: (c) =>
        copyToClipboard(
          buildAgentContext(c, {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          })
        ),
      onSetStatus: (c, status) => this.callbacks.onSetStatus(c.id, status),
      onSetType: (c, type) => this.callbacks.onSetType(c.id, type),
      onSetPriority: (c, priority) =>
        this.callbacks.onSetPriority(c.id, priority),
      onDelete: (c) => {
        if (this.detailId === c.id) this.detailId = null;
        this.callbacks.onDelete(c.id);
        this.render();
      },
    });
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

    const context = this._buildContextBlock(comment);
    if (context) detail.appendChild(context);

    const replies = document.createElement("div");
    replies.className = CLASSES.INBOX_REPLIES;
    for (const reply of comment.replies || []) {
      const replyEl = createReplyElement(reply, this.strings, this.locale);
      replyEl
        .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
        .forEach((/** @type {HTMLImageElement} */ img) => {
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
