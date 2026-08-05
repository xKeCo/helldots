// Right-side inbox sidebar: a filterable list of every comment and a detail
// view with the full thread. Pure view layer — all data mutations flow back
// to CommentOverlay through the callbacks contract passed to the
// constructor, so this module never touches storage or the page markers.

import { CLASSES, COMMENT_TYPES, PRIORITIES, STATUSES } from "./constants.js";
import { buildAgentContext } from "./agent-context.js";
import { attachMenuToggle } from "./menus.js";
import { createContextBlock } from "./context-block.js";
import {
  createCommentActions,
  copyToClipboard,
  statusLabelOf,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import {
  createMetaElement,
  createScreenshotsDisplay,
  createInputArea,
  createReplyElement,
  createBadgeRow,
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
    this.statusFilter = "all"; // "all" | STATUSES
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
    if (this.statusFilter !== "all") {
      // `open` is the implicit default: comments saved before RF09 have no
      // status at all and must still match the "open" chip.
      comments = comments.filter(
        (comment) => (comment.status || "open") === this.statusFilter
      );
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

  /**
   * Summary label for the collapsed filter button. The page filter always
   * contributes (it's either "All pages" or "Current page"); status, type,
   * and priority only join in when active, so an active filter is never
   * hidden from a user who hasn't opened the menu.
   */
  _filterSummaryLabel() {
    const parts = [this._pageFilterLabel(this.pageFilter)];
    if (this.statusFilter !== "all") {
      parts.push(statusLabelOf(this.statusFilter, this.strings));
    }
    if (this.typeFilter !== "all") {
      parts.push(typeLabelOf(this.typeFilter, this.strings));
    }
    if (this.priorityFilter !== "all") {
      parts.push(priorityLabelOf(this.priorityFilter, this.strings));
    }
    return parts.join(" · ");
  }

  _isFilterActive() {
    return (
      this.pageFilter !== "page" ||
      this.statusFilter !== "all" ||
      this.typeFilter !== "all" ||
      this.priorityFilter !== "all"
    );
  }

  /**
   * One chip group. Status, type and priority chips toggle: activating the
   * chip that is already on clears the group back to "all", which is why
   * they carry no explicit "All" chip. The page group does — it has no
   * neutral state, it's always one of two answers.
   *
   * @param {{ title: string, dataAttr: string, values: string[],
   *   labelOf: (value: string) => string, selected: string,
   *   toggles?: boolean, onSelect: (value: string) => void }} config
   */
  _buildFilterGroup({
    title,
    dataAttr,
    values,
    labelOf,
    selected,
    toggles = true,
    onSelect,
  }) {
    const group = document.createElement("div");
    group.className = CLASSES.INBOX_FILTER_GROUP;

    const heading = document.createElement("div");
    heading.className = CLASSES.INBOX_FILTER_SECTION;
    heading.textContent = title;
    group.appendChild(heading);

    const chips = document.createElement("div");
    chips.className = CLASSES.INBOX_FILTER_CHIPS;

    for (const value of values) {
      const checked = selected === value;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = CLASSES.INBOX_FILTER_CHIP;
      chip.dataset[dataAttr] = value;
      chip.setAttribute("role", toggles ? "switch" : "radio");
      chip.setAttribute("aria-checked", String(checked));
      chip.textContent = labelOf(value);
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(toggles && checked ? "all" : value);
        this.render();
      });
      chips.appendChild(chip);
    }

    group.appendChild(chips);
    return group;
  }

  _buildFilter() {
    const wrapper = document.createElement("div");
    wrapper.className = CLASSES.INBOX_FILTER + "-wrapper";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = CLASSES.INBOX_FILTER;
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = `<span>${this._filterSummaryLabel()}</span>${CARET_ICON_SVG}`;

    const menu = document.createElement("div");
    menu.className = CLASSES.INBOX_FILTER_MENU;
    menu.setAttribute("role", "group");
    menu.setAttribute("aria-label", this.strings.filterTitle);

    attachMenuToggle(btn, menu);

    const header = document.createElement("div");
    header.className = CLASSES.INBOX_FILTER_MENU_HEADER;

    const title = document.createElement("span");
    title.textContent = this.strings.filterTitle;
    header.appendChild(title);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = CLASSES.INBOX_FILTER_CLEAR;
    clear.textContent = this.strings.filterClear;
    clear.disabled = !this._isFilterActive();
    clear.addEventListener("click", (e) => {
      e.stopPropagation();
      this.pageFilter = "page";
      this.statusFilter = "all";
      this.typeFilter = "all";
      this.priorityFilter = "all";
      this.render();
    });
    header.appendChild(clear);
    menu.appendChild(header);

    menu.appendChild(
      this._buildFilterGroup({
        title: this.strings.filterByPage,
        dataAttr: "filterPage",
        values: ["page", "all"],
        labelOf: (value) => this._pageFilterLabel(value),
        selected: this.pageFilter,
        toggles: false,
        onSelect: (value) => (this.pageFilter = value),
      })
    );

    menu.appendChild(
      this._buildFilterGroup({
        title: this.strings.filterByStatus,
        dataAttr: "filterStatus",
        values: [...STATUSES],
        labelOf: (value) => statusLabelOf(value, this.strings),
        selected: this.statusFilter,
        onSelect: (value) => (this.statusFilter = value),
      })
    );

    menu.appendChild(
      this._buildFilterGroup({
        title: this.strings.filterByType,
        dataAttr: "filterType",
        values: [...COMMENT_TYPES],
        labelOf: (value) => typeLabelOf(value, this.strings),
        selected: this.typeFilter,
        onSelect: (value) => (this.typeFilter = value),
      })
    );

    menu.appendChild(
      this._buildFilterGroup({
        title: this.strings.filterByPriority,
        dataAttr: "filterPriority",
        values: [...PRIORITIES],
        labelOf: (value) => priorityLabelOf(value, this.strings),
        selected: this.priorityFilter,
        onSelect: (value) => (this.priorityFilter = value),
      })
    );

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

    // The action strip lives in the footer, not up here: five controls and
    // the author on one row squeezed the name into ~90px and wrapped it.
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

    const badges = createBadgeRow(comment, this.strings);
    if (badges) card.appendChild(badges);

    const tag = this._buildTag(comment);
    if (tag) card.appendChild(tag);

    // Footer: reply on the left, the action strip on the right with the
    // card's full width to lay out in.
    const footer = document.createElement("div");
    footer.className = CLASSES.INBOX_CARD_FOOTER;

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
      footer.appendChild(replyLink);

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

    footer.appendChild(this._buildCardActions(comment));
    card.appendChild(footer);

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
    return createCommentActions(comment, {
      strings: this.strings,
      onCopy: (c) =>
        copyToClipboard(
          buildAgentContext(c, {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            strings: this.strings,
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

    // Always expanded here: the detail view exists to show everything. The
    // thread popover renders the same block as a collapsed disclosure.
    const context = createContextBlock(comment, {
      strings: this.strings,
      onShowLightbox: (src) => this.callbacks.onShowLightbox(src),
    });
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
