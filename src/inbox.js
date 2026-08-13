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
  CARET_ICON_SVG,
  circleSelector,
  createMetaElement,
  renderScreenshotsPreview,
  wireScreenshotInput,
  wireScreenshotLightbox,
  createScreenshotsDisplay,
  createInputArea,
  createReplyElement,
  createBadgeRow,
  getShortcutText,
} from "./components.js";
import { sameId } from "./id.js";
import { createInlineEditor, confirmDiscard } from "./inline-editor.js";
import { buildCommentLink } from "./link.js";

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
   * @param {{ shortcutKey?: string, shortcutModifier?: string, linkParam?: string }} [deps.options]
   * @param {{ onOpenDetailScroll: Function, onReply: Function, onDelete: Function, onDeleteReply: Function, onEditComment: Function, onEditReply: Function, onSetStatus: Function, onSetType: Function, onSetPriority: Function, onNavigateToPage: Function, onShowLightbox: Function, onActivateCommentMode: Function, onClose: Function }} deps.callbacks
   */
  constructor({
    shadowRoot,
    strings,
    locale,
    currentPage,
    getComments,
    callbacks,
    options = {},
  }) {
    this.shadowRoot = shadowRoot;
    this.strings = strings;
    this.locale = locale;
    this.currentPage = currentPage;
    this.getComments = getComments;
    this.callbacks = callbacks;
    // Only the shortcut config is read, and only to teach the chord in the
    // empty state.
    this.options = options;
    this.pageFilter = "page"; // "all" | "page"
    this.statusFilter = "all"; // "all" | STATUSES
    this.typeFilter = "all"; // "all" | COMMENT_TYPES
    this.priorityFilter = "all"; // "all" | PRIORITIES
    this.detailId = null;
    /**
     * The one open editor, as state rather than DOM.
     *
     * This panel re-renders from ten places, and the overlay refreshes it
     * from seven more. A draft living only in a textarea would be wiped by
     * any of them — changing a comment's priority mid-sentence would eat the
     * sentence. Keeping it here means every one of those rebuilds is
     * harmless, and leaves only the deliberate exits to ask about.
     * @type {{ commentId: any, replyId: any | null, draft: string } | null}
     */
    this.editing = null;
    /** @type {string | null} */
    this.notice = null;
    /**
     * Keyed card cache: String(id) → the live comment object, the
     * fingerprint of what its card renders, and the card node itself. A
     * refresh reuses a node whose comment and fingerprint both still match
     * — which is what keeps thumbnails decoded and the list's scroll
     * position intact across the many refreshes this panel receives.
     * @type {Map<string, { comment: any, fingerprint: string, card: HTMLElement }>}
     */
    this._cardBindings = new Map();
    /** @type {HTMLElement | null} */
    this.el = null;
    /** @type {HTMLElement | null} */
    this._highlightedEl = null;
    /** @type {HTMLElement | null} */
    this._activeMarkerEl = null;
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
    // Announced as a dialog, so keyboard focus has to arrive with it —
    // otherwise the user tabs across the whole page to reach the panel.
    this.el.setAttribute("tabindex", "-1");
    this.shadowRoot.appendChild(this.el);
    this.render();
    this.el.focus();
  }

  close() {
    this._clearHighlight();
    this._setActiveMarker(null);
    this.el?.remove();
    this.el = null;
    this._cardBindings.clear();
    this.detailId = null;
    // Every route to here already went through releaseEditor(), so anything
    // still sitting in the draft has been answered for.
    this.editing = null;
    this.notice = null;
  }

  refresh() {
    if (this.el) this.render();
  }

  /** Back to the default view: current page, no status/type/priority. */
  _resetFilters() {
    this.pageFilter = "page";
    this.statusFilter = "all";
    this.typeFilter = "all";
    this.priorityFilter = "all";
    this.render();
  }

  /**
   * A line at the top of the list. Exists for one case: someone followed a
   * "Copy link" URL to a comment this page cannot show them. It stays until
   * the comment arrives (the overlay retries on every loadComments) or the
   * user navigates away from it.
   * @param {string} text
   */
  showNotice(text) {
    this.notice = text;
    this.refresh();
  }

  clearNotice() {
    if (!this.notice) return;
    this.notice = null;
    this.refresh();
  }

  /** True while an editor holds text the user has not saved. */
  isDirty() {
    if (!this.editing) return false;
    return this.editing.draft.trim() !== this._editingOriginalText().trim();
  }

  _editingOriginalText() {
    if (!this.editing) return "";
    const comment = this.getComments().find((c) =>
      sameId(c.id, this.editing.commentId)
    );
    if (!comment) return "";
    if (this.editing.replyId == null) return comment.text || "";
    const reply = (comment.replies || []).find((r) =>
      sameId(r.id, this.editing.replyId)
    );
    return reply?.text || "";
  }

  /**
   * Every path that would take the editor off screen funnels through here,
   * so the question is asked once and in one place instead of at each of the
   * exits (Cancel, Escape, the ⋯ of another comment, the close button, the
   * prev/next arrows, Back).
   * @returns {Promise<boolean>} true when the caller may proceed
   */
  async releaseEditor() {
    if (!this.editing) return true;
    if (this.isDirty()) {
      const host = /** @type {any} */ (this.el || this.shadowRoot);
      if (!(await confirmDiscard(host, this.strings))) return false;
    }
    this.editing = null;
    return true;
  }

  /**
   * The handlers every editor in this panel shares. Split out because the
   * comment body and a reply body are built by different components but must
   * behave identically — a draft that saved from one place and discarded
   * from the other would be two features wearing one look.
   */
  _editorHandlers() {
    return {
      draft: this.editing.draft,
      onInput: (text) => {
        this.editing.draft = text;
      },
      onSave: (text) => {
        const { commentId, replyId } = this.editing;
        if (replyId == null) this.callbacks.onEditComment(commentId, text);
        else this.callbacks.onEditReply(commentId, replyId, text);
        this.editing = null;
        this.render();
      },
      onCancel: async () => {
        if (await this.releaseEditor()) this.render();
      },
    };
  }

  _buildEditor() {
    const handlers = this._editorHandlers();
    return createInlineEditor({
      value: handlers.draft,
      strings: this.strings,
      onInput: handlers.onInput,
      onSave: handlers.onSave,
      onCancel: handlers.onCancel,
    });
  }

  /** Opens the editor on a comment body, or on one of its replies. */
  async startEditing(commentId, replyId = null) {
    if (!(await this.releaseEditor())) return;
    this.detailId = commentId;
    this.editing = { commentId, replyId, draft: "" };
    this.editing.draft = this._editingOriginalText();
    this.render();
  }

  /**
   * The on-page marker for a comment, when there is one to decorate.
   * Resolved, orphaned and hidden comments render no circle at all.
   * @param {any} comment
   * @returns {HTMLElement | null}
   */
  _markerFor(comment) {
    if (
      comment.anchorState !== "anchored" ||
      comment.hidden ||
      comment.status === "resolved"
    ) {
      return null;
    }
    return /** @type {any} */ (
      this.shadowRoot.querySelector(circleSelector(comment.id))
    );
  }

  _highlight(comment) {
    this._clearHighlight();
    const circle = this._markerFor(comment);
    if (!circle) return;
    circle.classList.add(CLASSES.HIGHLIGHT);
    this._highlightedEl = circle;
  }

  _clearHighlight() {
    this._highlightedEl?.classList.remove(CLASSES.HIGHLIGHT);
    this._highlightedEl = null;
  }

  /**
   * Opening a comment's detail selects it just as clicking its marker does,
   * so the marker gets the same active state the thread popover gives it.
   * Passing null clears it — the list view has nothing selected.
   * @param {any} comment
   */
  _setActiveMarker(comment) {
    this._activeMarkerEl?.classList.remove(CLASSES.CIRCLE_ACTIVE);
    this._activeMarkerEl = null;
    if (!comment) return;
    const circle = this._markerFor(comment);
    if (!circle) return;
    circle.classList.add(CLASSES.CIRCLE_ACTIVE);
    this._activeMarkerEl = circle;
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
    const comments = this.filteredComments();
    const detail =
      this.detailId != null
        ? comments.find((comment) => sameId(comment.id, this.detailId))
        : null;
    // Set before rendering so a detail reached by any route — a card click,
    // the prev/next nav, the cross-page handoff — marks its marker.
    this._setActiveMarker(detail);
    if (detail) {
      // The detail shows one comment: a full rebuild is cheap and keeps the
      // editing and reply wiring simple. Leaving the list view drops its
      // keyed state; the skeleton is rebuilt on the way back.
      this._cardBindings.clear();
      this.el.innerHTML = "";
      this._renderDetail(detail, comments);
    } else {
      this.detailId = null;
      this._renderList(comments);
    }
  }

  /**
   * Opens the panel (if needed) directly on a comment's detail. Used by
   * the overlay for the cross-page handoff on startup.
   * @param {import('./index.d.ts').CommentId} id
   */
  openDetail(id) {
    if (!this.el) this.open();
    const comment = this.getComments().find((c) => sameId(c.id, id));
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
    // `this.editing &&` short-circuits before the await, so with no editor
    // open this handler stays synchronous — closing the panel must not
    // become a microtask later just because editing exists as a feature.
    btn.addEventListener("click", async () => {
      if (this.editing && !(await this.releaseEditor())) return;
      this.callbacks.onClose();
    });
    return btn;
  }

  _renderList(comments) {
    // Persistent skeleton: the header and the scrolling list are built once
    // and survive every refresh. Replacing the list wholesale (the old
    // innerHTML = "" render) reset its scroll position and re-decoded every
    // thumbnail whenever anything anywhere changed.
    let list = [...this.el.children].find((el) =>
      el.classList.contains(CLASSES.INBOX_LIST)
    );
    if (!list) {
      this.el.innerHTML = "";
      this._cardBindings.clear();
      const header = document.createElement("div");
      header.className = CLASSES.INBOX_HEADER;
      this.el.appendChild(header);
      list = document.createElement("div");
      list.className = CLASSES.INBOX_LIST;
      this.el.appendChild(list);
    }

    // The header is label-driven (the filter summary changes with every
    // selection) and holds no scroll or image state — rebuilt each pass.
    const header = [...this.el.children].find((el) =>
      el.classList.contains(CLASSES.INBOX_HEADER)
    );
    header.replaceChildren(this._buildFilter(), this._closeButton());

    this._reconcileCards(list, comments);
  }

  /**
   * Everything a list card renders, captured as a comparable string. An
   * equal fingerprint for the same live comment object means the existing
   * node can be reused as-is — listeners, decoded thumbnails and all. The
   * object identity check matters because loadComments REPLACES comment
   * objects: a reused card whose closures held the stale object would
   * mutate a comment the overlay no longer owns.
   */
  _cardFingerprint(comment) {
    return JSON.stringify([
      comment.text,
      comment.editedAt ?? null,
      comment.status ?? "open",
      comment.type ?? null,
      comment.priority ?? null,
      comment.tags ?? [],
      comment.resolvedAt ?? null,
      comment.anchorState,
      comment.hidden === true,
      comment.page,
      comment.screenshots?.length ?? 0,
    ]);
  }

  _reconcileCards(list, comments) {
    // The notice and the empty state are stateless one-offs — always
    // rebuilt, and removed up front so they never count as "out of place"
    // cards during the ordering walk below.
    for (const el of [...list.children]) {
      if (
        el.classList.contains(CLASSES.INBOX_NOTICE) ||
        el.classList.contains(CLASSES.INBOX_EMPTY)
      ) {
        el.remove();
      }
    }

    const desired = [];
    if (this.notice) {
      const notice = document.createElement("div");
      notice.className = CLASSES.INBOX_NOTICE;
      notice.setAttribute("role", "status");
      notice.textContent = this.notice;
      desired.push(notice);
    }

    const seen = new Set();
    if (comments.length === 0) {
      desired.push(this._buildEmptyState());
    } else {
      for (const comment of comments) {
        const key = String(comment.id);
        const fingerprint = this._cardFingerprint(comment);
        const binding = this._cardBindings.get(key);
        let card;
        if (
          binding &&
          binding.comment === comment &&
          binding.fingerprint === fingerprint
        ) {
          card = binding.card;
        } else {
          card = this._buildCard(comment, { interactive: true });
          this._cardBindings.set(key, { comment, fingerprint, card });
        }
        seen.add(key);
        desired.push(card);
      }
    }

    for (const key of [...this._cardBindings.keys()]) {
      if (!seen.has(key)) this._cardBindings.delete(key);
    }

    // Minimal-move ordering: only nodes that are out of place are touched,
    // so an untouched tail keeps its position — and the container, which is
    // never replaced, keeps its scroll.
    desired.forEach((node, index) => {
      if (list.children[index] !== node) {
        list.insertBefore(node, list.children[index] ?? null);
      }
    });
    while (list.children.length > desired.length) {
      list.lastElementChild.remove();
    }
  }

  /**
   * Two different nothings, and telling a user the wrong one wastes their
   * time: an inbox with no comments at all needs teaching (what the shortcut
   * is, how to place the first one), while an inbox whose filters happen to
   * exclude everything needs the filters relaxed. Offering "turn on comment
   * mode" to someone who already has twenty comments would be nonsense.
   */
  _buildEmptyState() {
    const empty = document.createElement("div");
    empty.className = CLASSES.INBOX_EMPTY;

    // An outline of the marker the user is about to place, not a generic
    // placeholder — same teardrop silhouette the circles use.
    const icon = document.createElement("div");
    icon.className = CLASSES.INBOX_EMPTY_ICON;
    icon.setAttribute("aria-hidden", "true");
    empty.appendChild(icon);

    const hasAnyComment = this.getComments().length > 0;

    const title = document.createElement("div");
    title.className = CLASSES.INBOX_EMPTY_TITLE;
    title.textContent = hasAnyComment
      ? this.strings.inboxNoMatches
      : this.strings.inboxEmptyTitle;
    empty.appendChild(title);

    if (hasAnyComment) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = CLASSES.INBOX_EMPTY_ACTION;
      clear.textContent = this.strings.filterClear;
      clear.addEventListener("click", () => {
        this._resetFilters();
      });
      empty.appendChild(clear);
      return empty;
    }

    const text = document.createElement("div");
    text.className = CLASSES.INBOX_EMPTY_TEXT;
    // Split on the placeholder so the chord can be a real <kbd> rather than
    // bare text, without taking the sentence apart in the locale files.
    const [before, after] = String(this.strings.inboxEmptyHintTemplate).split(
      "{n}"
    );
    const kbd = document.createElement("kbd");
    kbd.className = CLASSES.INBOX_EMPTY_KBD;
    kbd.textContent = getShortcutText(this.options, this.strings);
    text.appendChild(document.createTextNode(before ?? ""));
    text.appendChild(kbd);
    text.appendChild(document.createTextNode(after ?? ""));
    empty.appendChild(text);

    const action = document.createElement("button");
    action.type = "button";
    action.className = CLASSES.INBOX_EMPTY_ACTION;
    action.textContent = this.strings.inboxEmptyAction;
    action.addEventListener("click", () =>
      this.callbacks.onActivateCommentMode()
    );
    empty.appendChild(action);

    return empty;
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
    // The page chips are role="radio" (exactly one active) and radios must
    // sit in a radiogroup; the toggling groups are switches, plain group.
    chips.setAttribute("role", toggles ? "group" : "radiogroup");
    chips.setAttribute("aria-label", title);

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
      this._resetFilters();
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

    // Meta alone on its row, action strip on the next one — the same split
    // the thread popover makes. Sharing a row squeezed the author into
    // ~90px and wrapped the name onto two lines.
    const header = document.createElement("div");
    header.className = CLASSES.INBOX_CARD_HEADER;
    header.appendChild(
      createMetaElement(
        comment.author,
        comment.createdAt,
        this.strings,
        this.locale,
        comment.editedAt
      )
    );
    card.appendChild(header);

    const actionsRow = document.createElement("div");
    actionsRow.className = CLASSES.THREAD_ACTIONS_ROW;
    actionsRow.appendChild(this._buildCardActions(comment));
    card.appendChild(actionsRow);

    // The editor only ever replaces the body in the detail view. On a list
    // card it would sit inside a control that navigates on click, so the ⋯
    // there routes through startEditing(), which opens the detail first.
    const editingThis =
      !interactive &&
      this.editing &&
      this.editing.replyId == null &&
      String(this.editing.commentId) === String(comment.id);

    if (editingThis) {
      card.appendChild(this._buildEditor());
    } else {
      const text = document.createElement("div");
      text.className = CLASSES.INBOX_CARD_TEXT;
      text.textContent = comment.text;
      card.appendChild(text);
    }

    if (comment.screenshots?.length) {
      const shots = createScreenshotsDisplay(comment.screenshots, this.strings);
      wireScreenshotLightbox(shots, (src) =>
        this.callbacks.onShowLightbox(src)
      );
      card.appendChild(shots);
    }

    // Status, type and priority already sit in the action strip above as
    // labelled pickers; repeating them here was the same fact twice. Tags
    // and the resolution time have no control anywhere, so they remain —
    // the row simply disappears when there is neither.
    const badges = createBadgeRow(comment, this.strings, {
      includeClassification: false,
    });
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
      onCopyLink: (c) =>
        copyToClipboard(buildCommentLink(c, this.options.linkParam)),
      // From a list card this opens the detail with the editor already up:
      // a textarea inside a card that navigates on click, and highlights a
      // marker on hover, would be fighting three behaviours at once.
      onEdit: (c) => this.startEditing(c.id),
      onSetStatus: (c, status) => this.callbacks.onSetStatus(c.id, status),
      onSetType: (c, type) => this.callbacks.onSetType(c.id, type),
      onSetPriority: (c, priority) =>
        this.callbacks.onSetPriority(c.id, priority),
      onDelete: (c) => {
        if (this.detailId != null && sameId(this.detailId, c.id)) {
          this.detailId = null;
        }
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
    backBtn.addEventListener("click", async () => {
      if (this.editing && !(await this.releaseEditor())) return;
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
        // Navigating to another comment takes the edited text off screen. A
        // draft that survived that invisibly and reappeared later would be
        // worse than being asked about it here.
        btn.addEventListener("click", async () => {
          if (this.editing && !(await this.releaseEditor())) return;
          this._openDetail(target);
        });
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
      const editingThisReply =
        this.editing &&
        String(this.editing.commentId) === String(comment.id) &&
        String(this.editing.replyId) === String(reply.id);

      const replyEl = createReplyElement(reply, this.strings, this.locale, {
        // Drops the row instead of re-rendering the detail: a full render
        // would also throw away whatever the user has half-typed in the
        // reply box below.
        onDelete: (r, el) => {
          if (this.callbacks.onDeleteReply(comment.id, r.id)) el.remove();
        },
        onEdit: (r) => this.startEditing(comment.id, r.id),
        editing: editingThisReply ? this._editorHandlers() : null,
      });
      wireScreenshotLightbox(replyEl, (src) =>
        this.callbacks.onShowLightbox(src)
      );
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
      renderScreenshotsPreview(screenshotsContainer, pendingScreenshots, {
        strings: this.strings,
        onShow: (dataUrl) => this.callbacks.onShowLightbox(dataUrl),
        rerender: () => updatePreview(),
      });
    };

    attachBtn.addEventListener("click", () => fileInput.click());
    wireScreenshotInput(fileInput, () => pendingScreenshots, updatePreview);

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
