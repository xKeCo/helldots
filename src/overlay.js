import { CaptureFlow } from "./capture-flow.js";
import { captureContext } from "./metadata.js";
import {
  CLASSES,
  IDS,
  SELECTORS,
  STATUSES,
  COMMENT_TYPES,
  PRIORITIES,
  MARKER_SIZE,
  MAX_SCREENSHOTS,
} from "./constants.js";
import { getStyles, getGlobalStyles } from "./styles.js";
import { mountStyles } from "./style-mount.js";
import { getShadowRoot, TAG_NAME } from "./root-element.js";
import { getStrings, detectLocale } from "./i18n.js";
import {
  createAnchor,
  resolveAnchor,
  generateElementSelector,
} from "./anchor.js";
import {
  readStoredComments,
  writeStoredComments,
  mergeForStorage,
  STORAGE_KEY,
  PENDING_DETAIL_KEY,
} from "./storage.js";
import { createId, sameId } from "./id.js";
import {
  buildCommentLink,
  readCommentLinkParam,
  DEFAULT_LINK_PARAM,
} from "./link.js";
import {
  createToolbar,
  cssAttrValue,
  isMacPlatform,
  renderScreenshotsPreview,
  wireScreenshotInput,
  wireScreenshotLightbox,
  createCommentBox,
  createTooltip,
} from "./components.js";
import {
  PopoverController,
  positionPopoverAtCircle,
} from "./popover-controller.js";
import { MarkerEngine } from "./marker-engine.js";
import { InboxView } from "./inbox.js";
import { closeOpenMenus } from "./menus.js";
import { closeOpenConfirmDialogs } from "./confirm-dialog.js";

// Tags are user-typed, so they arrive with stray case and whitespace.
// Normalising here (rather than at each entry point) is what makes
// "Checkout" and "checkout " the same tag for filtering.
const normalizeTags = (tags) => {
  const seen = new Set();
  for (const tag of tags) {
    const clean = String(tag).trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return [...seen];
};

// Screenshots are data-URLs rendered straight into <img src>; anything else
// in a persisted array is a silently broken thumbnail waiting to happen.
const onlyStrings = (values) => values.filter((v) => typeof v === "string");

// Every change the host can hear about, as `type` → the specific callback
// that has always carried it. One table so a new event cannot be added to
// the stream while forgetting the callback (or the other way round), and so
// the two can never disagree about when they fire.
const CHANGE_CALLBACKS = {
  "comment:created": "onCommentCreated",
  "comment:edited": "onCommentEdited",
  "comment:deleted": "onCommentDeleted",
  "comment:status-changed": "onCommentStatusChanged",
  "comment:updated": "onCommentUpdated",
  "comment:anchor-lost": "onAnchorLost",
  "reply:added": "onReplyAdded",
  "reply:deleted": "onReplyDeleted",
  "reply:edited": "onReplyEdited",
};

class CommentOverlay {
  /**
   * @param {import('./index.d.ts').CommentOverlayOptions} [options]
   */
  constructor(options = {}) {
    this.comments = [];
    this.commentMode = false;
    this.isMac = isMacPlatform();
    this.options = {
      shortcutKey: options.shortcutKey || (this.isMac ? "c" : "C"),
      shortcutModifier: options.shortcutModifier || "alt",
      autoScreenshot: options.autoScreenshot !== false,
      ...options,
    };
    this.locale = this.options.locale || detectLocale();
    this.strings = getStrings(this.locale);

    /**
     * Marker positioning, occlusion and observers (see marker-engine.js).
     * Created in initOverlay — its circles mount into the overlay element.
     * @type {MarkerEngine | null}
     */
    this.markers = null;
    /**
     * Drag selection + screenshot orchestration (see capture-flow.js).
     * Created in initOverlay — it mounts the selection rect into the
     * shadow root. @type {CaptureFlow | null}
     */
    this._captureFlow = null;

    /**
     * Parsed cross-page corpus, so every mutation does not pay a full
     * getItem + JSON.parse (megabytes once screenshots accumulate). Kept in
     * step with what this instance writes; dropped when another tab writes
     * (the `storage` listener in initOverlay).
     * @type {import('./index.d.ts').SerializedComment[] | null}
     */
    this._storedCache = null;

    /**
     * Thread-popover lifecycle and editing state (see
     * popover-controller.js). Created in initOverlay — it mounts into the
     * shadow root. @type {PopoverController | null}
     */
    this._popover = null;
    /**
     * A comment someone asked to open — from a "Copy link" URL or the
     * cross-page handoff — that has not been found yet.
     * @type {string | null}
     */
    this._pendingDetailId = null;

    if (document.readyState === "loading") {
      // Kept on the instance so cleanup() can cancel it — an instance
      // destroyed while the document is still loading must not mount a
      // zombie UI when DOMContentLoaded fires.
      this._onDomReady = () => this.initOverlay();
      document.addEventListener("DOMContentLoaded", this._onDomReady);
    } else {
      this.initOverlay();
    }
  }

  initOverlay() {
    // Mount inside a dedicated shadow root so widget styles/markup stay
    // isolated from the host page in both directions.
    this.shadowRoot = getShadowRoot();

    // Create and append UI elements
    this.toolbar = createToolbar(this.options, this.strings);
    this.commentBox = createCommentBox(this.strings);
    this.overlay = document.createElement("div");
    this.overlay.className = CLASSES.COMMENT_OVERLAY;

    this.shadowRoot.appendChild(this.overlay);
    this.shadowRoot.appendChild(this.toolbar);
    this.shadowRoot.appendChild(this.commentBox);

    this.commentBtn = this.toolbar.querySelector(
      `.${CLASSES.TOOLBAR_COMMENT_BTN}`
    );
    this.inboxBtn = this.toolbar.querySelector(`.${CLASSES.TOOLBAR_MENU_BTN}`);
    /** @type {HTMLButtonElement} */
    this.submitButton = /** @type {any} */ (
      this.shadowRoot.getElementById(IDS.SUBMIT_COMMENT)
    );
    /** @type {HTMLTextAreaElement} */
    this.commentInput = /** @type {any} */ (
      this.shadowRoot.getElementById(IDS.COMMENT_INPUT)
    );
    this.attachImageBtn = this.commentBox.querySelector(
      `.${CLASSES.ATTACH_IMAGE_BTN}`
    );
    /** @type {HTMLInputElement} */
    this.attachImageInput = /** @type {any} */ (
      this.shadowRoot.getElementById(IDS.ATTACH_IMAGE_INPUT)
    );

    this._captureFlow = new CaptureFlow({
      host: this.shadowRoot,
      autoScreenshot: this.options.autoScreenshot,
      // The pending-attachments array stays here, next to the comment box
      // that previews it — the flow only reports what a drag captured.
      onRegionCaptured: (dataUrl) => {
        if (!this._pendingScreenshots) this._pendingScreenshots = [];
        if (this._pendingScreenshots.length < MAX_SCREENSHOTS) {
          this._pendingScreenshots.push(dataUrl);
        }
      },
      onPlace: (x, y) => this._placeCommentAtPoint(x, y),
    });

    this._popover = new PopoverController({
      shadowRoot: this.shadowRoot,
      strings: this.strings,
      locale: this.locale,
      findComment: (id) => this._findComment(id),
      removeTooltip: (id) => this._tooltipEl(id)?.remove(),
      onShowLightbox: (src) => this.showLightbox(src),
      isInsideLightbox: (target) => this._isInsideLightbox(target),
      linkParam: () => this._linkParam(),
      refreshInbox: () => {
        if (this.inboxView?.isOpen()) this.inboxView.refresh();
      },
      actions: {
        addReply: (comment, text, screenshots) =>
          this.addReply(comment, text, screenshots),
        deleteReply: (commentId, replyId) =>
          this.deleteReply(commentId, replyId),
        editComment: (id, text) => this.editComment(id, text),
        editReply: (commentId, replyId, text) =>
          this.editReply(commentId, replyId, text),
        setStatus: (id, status) => this.setCommentStatus(id, status),
        setType: (id, type) => this.setCommentType(id, type),
        setPriority: (id, priority) => this.setCommentPriority(id, priority),
        deleteComment: (id) => this.deleteComment(id),
      },
    });

    this.markers = new MarkerEngine({
      container: this.overlay,
      strings: this.strings,
      getComments: () => this.comments,
      wireMarker: (circle, comment) => this._wireMarker(circle, comment),
      onMarkerHidden: (comment) => this._dismissMarkerUi(comment),
      onVisibilityFlip: () => {
        if (this.inboxView?.isOpen()) this.inboxView.refresh();
      },
      // Runs after every rAF pass: the markers are placed in viewport
      // coordinates, so the open thread popover has to follow.
      onAfterPass: () => this.syncThreadPopoverToMarker(),
    });
    this.markers.start();

    // Bind event listeners
    this.bindEventListeners();
    this.setupKeyboardShortcut();
    this.injectStyles();

    this._pendingDetailId = this._readPendingDetailId();

    if (this.options.persistence === "localStorage") {
      this._storedCache = readStoredComments();
      this.loadComments(this._storedCache);
      // Another tab writing the key makes this instance's parsed copy
      // stale — drop it so the next sync re-reads before merging, instead
      // of clobbering what the other tab persisted.
      this._storageHandler = (e) => {
        if (e.key === STORAGE_KEY || e.key === null) this._storedCache = null;
      };
      window.addEventListener("storage", this._storageHandler);
    }
    // Also outside localStorage mode: a host that persists comments itself
    // still deserves to have the link honoured, and until its loadComments()
    // arrives the inbox is what tells the user the link was understood.
    this._openPendingDetail();

    // Opt-in, never default: popstate only covers back/forward, and MPA
    // hosts should not inherit listeners for navigations they don't do.
    // pushState routing still needs an explicit notifyNavigation() call.
    if (this.options.autoDetectNavigation) {
      this._popstateHandler = () => this.notifyNavigation();
      window.addEventListener("popstate", this._popstateHandler);
    }
  }

  _navigateTo(url) {
    // A host router can take over (SPA): a full-page load throws away the
    // app's state just to show another route it could render itself.
    if (typeof this.options.navigate === "function") {
      this.options.navigate(url);
      return;
    }
    location.assign(url);
  }

  /**
   * Where a request to open one comment can come from. Two sources, one
   * slot: an inactive card clicked on the previous page (sessionStorage), or
   * a "Copy link" URL someone was sent. The URL wins when both are present —
   * it is the one the user acted on just now.
   * @returns {string | null}
   */
  _readPendingDetailId() {
    const fromLink = readCommentLinkParam(this._linkParam());
    let fromHandoff = null;
    try {
      fromHandoff = sessionStorage.getItem(PENDING_DETAIL_KEY);
      // One-shot: read it and it is spent, whether or not it resolves.
      if (fromHandoff != null) sessionStorage.removeItem(PENDING_DETAIL_KEY);
    } catch {
      // A blocked sessionStorage only costs the handoff, not the link.
    }
    return fromLink ?? fromHandoff;
  }

  _linkParam() {
    return this.options.linkParam || DEFAULT_LINK_PARAM;
  }

  /**
   * Opens the inbox on the pending comment, if there is one.
   *
   * Deliberately does NOT give up when the id fails to resolve: a host that
   * fetches its comments from its own back end has not called loadComments()
   * yet at startup, and that is precisely the setup where a link is worth
   * sending to another person. The id is kept and this runs again after
   * every load, so the inbox switches from "not on this page" to the comment
   * the moment the data lands.
   */
  _openPendingDetail() {
    const id = this._pendingDetailId;
    if (!id) return;

    const comment = this._findComment(id);
    if (!comment) {
      // Opening the inbox anyway is the point: clicking a link and having
      // nothing at all happen is indistinguishable from a broken widget.
      this.showInbox();
      this.inboxView?.showNotice(this.strings.commentNotFound);
      return;
    }

    this._pendingDetailId = null;
    this.showInbox();
    this.inboxView.clearNotice();
    this.inboxView.openDetail(comment.id);
  }

  /**
   * The one place a change leaves the widget. Fires the specific callback
   * that has always carried this event and then the onChange stream, so a
   * host can subscribe either way — or both — and never sees the two
   * disagree about what happened or when.
   *
   * Host handlers are isolated: a subscriber that throws must not roll back
   * a mutation that already happened, and must not stop its sibling from
   * hearing about it either.
   *
   * @param {keyof typeof CHANGE_CALLBACKS} type
   * @param {any[]} callbackArgs arguments for the specific callback, in the
   *   order it has always taken them
   * @param {Object} payload the event's own fields, minus `type`
   */
  _emit(type, callbackArgs, payload) {
    const name = CHANGE_CALLBACKS[type];
    const callback = this.options[name];
    if (typeof callback === "function") {
      try {
        callback(...callbackArgs);
      } catch (err) {
        console.warn(`HellDots: ${name} handler threw`, err);
      }
    }
    if (typeof this.options.onChange === "function") {
      try {
        this.options.onChange({ type, ...payload });
      } catch (err) {
        console.warn("HellDots: onChange handler threw", err);
      }
    }
  }

  /** The shareable URL for a comment, as "Copy link" builds it. */
  commentLink(id) {
    const comment = this._findComment(id);
    return comment ? buildCommentLink(comment, this._linkParam()) : null;
  }

  /** The parsed corpus, re-read only after another tab invalidated it. */
  _readStoredCached() {
    if (!this._storedCache) this._storedCache = readStoredComments();
    return this._storedCache;
  }

  _syncStorage() {
    if (this.options.persistence !== "localStorage") return;
    const merged = mergeForStorage(
      this._readStoredCached(),
      this.serializeComments(),
      location.pathname
    );
    writeStoredComments(merged);
    // The merge IS the new stored state (quota shedding only nulls
    // contextScreenshot in the written copy, which the next merge would
    // reattempt from memory anyway — same as before the cache existed).
    this._storedCache = merged;
  }

  bindEventListeners() {
    this.commentBtn.addEventListener("click", () => this.toggleCommentMode());
    this.inboxBtn.addEventListener("click", () => this.toggleInbox());
    this.submitButton.addEventListener("click", () => this.saveComment());

    this.commentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.saveComment();
      }
    });

    this.attachImageBtn.addEventListener("click", () => {
      this.attachImageInput.click();
    });

    wireScreenshotInput(
      this.attachImageInput,
      () => {
        if (!this._pendingScreenshots) this._pendingScreenshots = [];
        return this._pendingScreenshots;
      },
      () => this._updateScreenshotsPreview()
    );

    this._handleDocumentClickBound = (e) => this.handleDocumentClick(e);
    document.addEventListener("mousedown", this._handleDocumentClickBound);
  }

  setupKeyboardShortcut() {
    // Remove any existing event listeners
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }

    // Create a new handler with proper binding
    this.keydownHandler = (e) => {
      if (e.key === "Escape") {
        if (this._activeLightbox) {
          this.closeLightbox();
        } else if (this.activeThreadPopover) {
          // An open editor answers Escape first, and closes only itself. The
          // editor's own textarea stops the event before it reaches here, so
          // this branch is for an Escape pressed with focus somewhere else in
          // the popover — which must not take the panel down either.
          if (this._popover.isEditing()) this._popover.releaseEditor();
          else this.closeThreadPopover();
        } else if (this.inboxView?.isOpen()) {
          if (this.inboxView.editing) {
            this.inboxView
              .releaseEditor()
              .then((released) => released && this.inboxView?.refresh());
          } else {
            this.closeInbox();
          }
        } else if (this.commentBox.style.display !== "none") {
          this.hideCommentBox();
          this.toggleCommentMode();
        } else if (this.commentMode) {
          this.toggleCommentMode();
        }
        return;
      }

      // One matcher for default and custom chords alike — the old hardcoded
      // Alt+C fallbacks fired unconditionally, so a host that configured its
      // own shortcut got Alt+C on top of it with no way to turn it off.
      const key = this.options.shortcutKey.toLowerCase();
      const keyMatches =
        e.key.toLowerCase() === key ||
        // Option+letter on macOS (and AltGr layouts) types a dead or special
        // character ("ç" for Option+C, "˚" for Option+K), so e.key never
        // spells the configured letter there. e.code names the physical key
        // and is what makes Alt chords matchable at all.
        (e.altKey &&
          /^[a-z]$/.test(key) &&
          e.code === `Key${key.toUpperCase()}`);
      const modifierMatches =
        (this.options.shortcutModifier === "alt" && e.altKey) ||
        (this.options.shortcutModifier === "ctrl" &&
          (e.ctrlKey || e.metaKey)) ||
        (this.options.shortcutModifier === "shift" && e.shiftKey);

      if (keyMatches && modifierMatches) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleCommentMode();
      }
    };

    // Add the event listener
    document.addEventListener("keydown", this.keydownHandler);
  }

  handleDocumentClick(e) {
    if (!this.commentMode) return;

    // Listener is attached on `document`, outside the shadow boundary, so
    // `e.target` gets retargeted to the shadow host. Use composedPath() to
    // recover the real, deepest target inside the shadow tree.
    const target = e.composedPath()[0] || e.target;

    if (
      this.toolbar.contains(target) ||
      target?.closest?.(`.${CLASSES.CIRCLE}`) ||
      target?.closest?.(`.${CLASSES.TOOLTIP}`) ||
      target?.closest?.(`.${CLASSES.THREAD_POPOVER}`) ||
      target?.closest?.(`.${CLASSES.INBOX_PANEL}`) ||
      target?.closest?.(`.${CLASSES.LIGHTBOX}`)
    ) {
      return;
    }

    if (this.commentBox.contains(target)) {
      return;
    }

    if (this.commentBox.style.display !== "none") {
      this.hideCommentBox();
      this.toggleCommentMode();
      return;
    }

    if (e.button !== 0) return;
    e.preventDefault();

    this._captureFlow.beginDrag(e);
  }

  async _placeCommentAtPoint(clientX, clientY) {
    // The no-drag path has no render yet — kick the background capture off
    // now so it resolves while the user types (see capture-flow.js).
    this._captureFlow.armClickCapture();

    const prevPointerEvents = this.overlay.style.pointerEvents;
    this.overlay.style.pointerEvents = "none";
    const underlying = document.elementFromPoint(clientX, clientY);
    this.overlay.style.pointerEvents = prevPointerEvents || "";

    const container =
      underlying?.closest?.(SELECTORS.CONTAINER) || document.body;
    const containerRect = container.getBoundingClientRect();

    // Zero-size containers (display:none, not yet laid out) would make the
    // division blow up to Infinity — which isn't JSON-serializable either.
    const relativeX =
      containerRect.width > 0
        ? (clientX - containerRect.left) / containerRect.width
        : 0;
    const relativeY =
      containerRect.height > 0
        ? (clientY - containerRect.top) / containerRect.height
        : 0;

    const anchor = createAnchor(
      /** @type {HTMLElement} */ (container),
      relativeX,
      relativeY
    );
    // The clicked element can disappear (responsive display:none) while the
    // coarse anchor container stays visible — track it separately so the
    // marker hides with what the user actually commented on.
    anchor.targetSelector =
      underlying && underlying !== container
        ? generateElementSelector(/** @type {HTMLElement} */ (underlying))
        : null;

    this.currentPosition = {
      container,
      relativeX,
      relativeY,
      anchor,
      target: /** @type {HTMLElement} */ (underlying || container),
    };

    this.createPreviewCircle(clientX, clientY);
    document.body.classList.remove(CLASSES.COMMENT_CURSOR);

    if (this._pendingScreenshots && this._pendingScreenshots.length > 0) {
      this._updateScreenshotsPreview();
    }

    this.showCommentBox(clientX, clientY);
  }

  _updateScreenshotsPreview() {
    const container = this.commentBox.querySelector(
      `.${CLASSES.SCREENSHOTS_CONTAINER}`
    );
    if (!container) return;
    renderScreenshotsPreview(container, this._pendingScreenshots || [], {
      strings: this.strings,
      onShow: (dataUrl) => this.showLightbox(dataUrl),
      rerender: () => this._updateScreenshotsPreview(),
    });
  }

  _clearScreenshotPreview() {
    this._pendingScreenshots = [];
    const container = this.commentBox.querySelector(
      `.${CLASSES.SCREENSHOTS_CONTAINER}`
    );
    if (container) {
      container.innerHTML = "";
      container.classList.remove(CLASSES.ACTIVE);
    }
  }

  showCommentBox(x, y) {
    this.commentBox.style.display = "block";

    const circleBaseSize = MARKER_SIZE;
    const circleRadius = circleBaseSize / 2;
    const offset = circleRadius + 10;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Measured, not assumed: the box is 400px wide on a roomy viewport but
    // narrows to `100vw - 24px` on a phone. A hardcoded width here is what
    // used to push it off the right edge on mobile.
    const boxRect = this.commentBox.getBoundingClientRect();
    const boxWidth = boxRect.width || 400;

    const centerX = x + circleRadius;
    const centerY = y + circleRadius;

    let adjustedX = centerX + offset;
    let adjustedY = centerY - circleRadius;

    if (adjustedX + boxWidth > windowWidth) {
      adjustedX = centerX - offset - boxWidth;
    }
    // Clamp both edges: on a viewport narrower than the box plus its
    // margins, flipping to the other side isn't enough on its own.
    adjustedX = Math.min(adjustedX, windowWidth - boxWidth - 10);
    adjustedX = Math.max(10, adjustedX);

    if (adjustedY + boxRect.height > windowHeight) {
      adjustedY = windowHeight - boxRect.height - 10;
    }
    adjustedY = Math.max(10, adjustedY);

    this.commentBox.style.left = `${adjustedX}px`;
    this.commentBox.style.top = `${adjustedY}px`;

    this.commentInput.value = "";
    setTimeout(() => this.commentInput.focus(), 50);
  }

  hideCommentBox() {
    this.commentBox.style.display = "none";
    this.commentInput.style.height = "auto";
    this.currentPosition = null;
    this.removePreviewCircle();
    this._clearScreenshotPreview();
    this._captureFlow?.clearPending();
    /** @type {any} */ (this.commentBox).classify?.reset();

    if (this.commentMode) {
      document.body.classList.add(CLASSES.COMMENT_CURSOR);
    }
  }

  toggleCommentMode() {
    this.commentMode = !this.commentMode;
    // The inbox is a full-height panel over the page; leaving it open would
    // cover the very content the user now has to click on. Clicking the
    // toolbar button already closed it as an outside click — this is what
    // covers the keyboard shortcut and the empty state's own button.
    if (this.commentMode) this.closeInbox();
    this.commentBtn?.classList.toggle(CLASSES.ACTIVE, this.commentMode);
    this.commentBtn?.setAttribute("aria-pressed", String(this.commentMode));
    this.overlay.classList.toggle(CLASSES.ACTIVE, this.commentMode);
    document.body.classList.toggle(CLASSES.COMMENT_CURSOR, this.commentMode);

    if (!this.commentMode) {
      this.hideCommentBox();
    }
  }

  async saveComment() {
    // Two Enters while the capture resolves must not save twice.
    if (this._saving) return;
    if (!this.commentInput.value.trim() || !this.currentPosition) return;
    this._saving = true;
    try {
      await this._saveCommentNow();
    } finally {
      this._saving = false;
    }
  }

  async _saveCommentNow() {
    // The capture kicked off when the box opened; by save time it has
    // usually resolved and this await costs nothing.
    const contextScreenshot = await this._captureFlow.consumePending();
    // The box may have been dismissed (Escape) while awaiting — a save that
    // lands after that would contradict what the user sees on screen.
    if (!this.currentPosition) return;

    const comment = {
      text: this.commentInput.value,
      container: this.currentPosition.container,
      relativeX: this.currentPosition.relativeX,
      relativeY: this.currentPosition.relativeY,
      anchor: this.currentPosition.anchor,
      anchorState: "anchored",
      target: this.currentPosition.target,
      hidden: false,
      status: "open",
      page: location.pathname,
      id: createId(),
      replies: [],
      author: this.options.user?.name || this.strings.anonymous,
      createdAt: new Date().toISOString(),
      screenshots: this._pendingScreenshots
        ? [...this._pendingScreenshots]
        : [],
      type: /** @type {any} */ (this.commentBox).classify?.getType() ?? null,
      priority:
        /** @type {any} */ (this.commentBox).classify?.getPriority() ?? null,
      // No longer authored in the widget — kept on the model for
      // setCommentTags() and for comments imported through loadComments().
      tags: [],
      resolvedAt: null,
      context: captureContext(),
      contextScreenshot,
    };

    this.comments.push(comment);
    this._syncStorage();
    const created = this._serializeComment(comment);
    this._emit("comment:created", [created], { comment: created });
    this.renderCommentCircle(comment);
    this.hideCommentBox();
    this.toggleCommentMode();

    const circle = this._circles.get(String(comment.id));
    if (circle) {
      this.showThreadPopover(circle, comment);
    }
  }

  renderCommentCircle(comment) {
    this.markers.render(comment);
  }

  /**
   * What a marker opens when interacted with — tooltip on hover, thread
   * popover on activation. UI wiring only; the engine calls this once per
   * circle it creates and owns everything about position and visibility.
   */
  _wireMarker(circle, comment) {
    circle.addEventListener("mouseenter", () =>
      this.showCommentTooltip(circle, comment)
    );
    circle.addEventListener("mouseleave", () => {
      setTimeout(() => {
        const tooltip = this._tooltipEl(comment.id);
        if (tooltip && !tooltip.matches(":hover")) {
          tooltip.remove();
        }
      }, 250);
    });

    circle.addEventListener("click", (e) => {
      e.stopPropagation();
      this._tooltipEl(comment.id)?.remove();
      // The marker toggles its own thread: clicking the active marker
      // closes it rather than tearing the popover down and rebuilding an
      // identical one. Only its own — clicking a different marker still
      // switches to that thread.
      if (this.activeThreadPopover?.dataset.for === String(comment.id)) {
        this.closeThreadPopover();
        return;
      }
      this.showThreadPopover(circle, comment);
    });

    // The circle is a <div role="button">, so unlike a real <button> it
    // doesn't get Enter/Space-activates-click for free.
    circle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        circle.click();
      }
    });
  }

  showCommentTooltip(circle, comment) {
    const existingPopover = this.shadowRoot.querySelector(
      `.${CLASSES.THREAD_POPOVER}[data-for="${cssAttrValue(comment.id)}"]`
    );
    if (existingPopover) return;

    if (this._tooltipEl(comment.id)) return;

    const tooltip = createTooltip(comment, this.strings, this.locale);
    this.shadowRoot.appendChild(tooltip);

    wireScreenshotLightbox(tooltip, (src) => this.showLightbox(src));

    setTimeout(() => {
      positionPopoverAtCircle(tooltip, circle);
    }, 10);

    tooltip
      .querySelector(`.${CLASSES.CLOSE_TOOLTIP}`)
      .addEventListener("click", (e) => {
        e.stopPropagation();
        tooltip.remove();
      });

    tooltip.addEventListener("mouseleave", () => tooltip.remove());
  }

  toggleInbox() {
    if (this.inboxView?.isOpen()) {
      this.closeInbox();
    } else {
      this.showInbox();
    }
  }

  showInbox() {
    this.closeThreadPopover();

    if (!this.inboxView) {
      this.inboxView = new InboxView({
        shadowRoot: this.shadowRoot,
        strings: this.strings,
        locale: this.locale,
        currentPage: location.pathname,
        getComments: () => this.comments,
        options: this.options,
        callbacks: {
          onActivateCommentMode: () => {
            this.closeInbox();
            // Never a toggle: the button reads "turn on comment mode", so
            // pressing it while the mode is already on must not turn it off.
            if (!this.commentMode) this.toggleCommentMode();
          },
          onOpenDetailScroll: (comment) => this.scrollMarkerIntoView(comment),
          onReply: (comment, text, screenshots) =>
            this.addReply(comment, text, screenshots),
          onDelete: (id) => this.deleteComment(id),
          onDeleteReply: (commentId, replyId) =>
            this.deleteReply(commentId, replyId),
          onEditComment: (id, text) => {
            if (!this.editComment(id, text)) return;
            // The marker's hover tooltip and the open thread both quote the
            // text that just changed, and neither rebuilds on its own.
            this._popover.refreshCommentViews(id);
          },
          onEditReply: (commentId, replyId, text) => {
            if (!this.editReply(commentId, replyId, text)) return;
            this._popover.refreshCommentViews(commentId);
          },
          onSetStatus: (id, status) => this.setCommentStatus(id, status),
          onSetType: (id, type) => this.setCommentType(id, type),
          onSetPriority: (id, priority) =>
            this.setCommentPriority(id, priority),
          onNavigateToPage: (comment) => {
            try {
              sessionStorage.setItem(PENDING_DETAIL_KEY, String(comment.id));
            } catch {}
            this._navigateTo(comment.page);
          },
          onShowLightbox: (src) => this.showLightbox(src),
          onClose: () => this.closeInbox(),
        },
      });
    }
    this.inboxView.open();

    setTimeout(() => {
      this._inboxClickHandler = (e) => {
        const target = e.composedPath()[0] || e.target;
        if (
          !this.inboxView.el?.contains(target) &&
          !this.inboxBtn.contains(target) &&
          !this._isInsideLightbox(target)
        ) {
          // Same reasoning as the thread popover: an unsaved draft turns a
          // click outside into "stay open", not into a question.
          if (this.inboxView.isDirty()) return;
          this.closeInbox();
        }
      };
      document.addEventListener("mousedown", this._inboxClickHandler);
    }, 0);
  }

  closeInbox() {
    this.inboxView?.close();
    if (this._inboxClickHandler) {
      document.removeEventListener("mousedown", this._inboxClickHandler);
      this._inboxClickHandler = null;
    }
  }

  /**
   * The open thread popover element, or null. Lives on the controller;
   * surfaced under its historical name because the inbox, the marker
   * engine paths and the test suite all read it here.
   */
  get activeThreadPopover() {
    return this._popover?.active ?? null;
  }

  // `circle` may be null for orphaned comments (opened from the inbox):
  // the popover is centered in the viewport instead of pinned to a marker.
  showThreadPopover(circle, comment) {
    this._popover.show(circle, comment);
  }

  closeThreadPopover() {
    // cleanup() reaches here before initOverlay() has run when the document
    // was still loading, so there may be no controller yet.
    this._popover?.close();
  }

  syncThreadPopoverToMarker() {
    this._popover?.syncToMarker();
  }

  showLightbox(imageSrc) {
    this.closeLightbox();

    // Whoever opened the lightbox (a thumbnail in the shadow tree, or a
    // host-page element) gets focus back when it closes.
    this._lightboxReturnFocus =
      this.shadowRoot.activeElement || document.activeElement;

    const lightbox = document.createElement("div");
    lightbox.className = CLASSES.LIGHTBOX;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", this.strings.screenshotPreview);

    const img = document.createElement("img");
    img.className = CLASSES.LIGHTBOX_IMG;
    img.src = imageSrc;
    img.alt = this.strings.screenshotPreview;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = CLASSES.LIGHTBOX_CLOSE;
    closeBtn.setAttribute("aria-label", this.strings.close);
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => this.closeLightbox());

    lightbox.appendChild(img);
    lightbox.appendChild(closeBtn);

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) this.closeLightbox();
    });

    this.shadowRoot.appendChild(lightbox);
    this._activeLightbox = lightbox;

    // aria-modal is a promise about focus: the page behind the backdrop must
    // be unreachable. The close button is the only stop, so the trap is a
    // re-focus rather than a ring walk — same reasoning as confirm-dialog,
    // and on document in the capture phase for the same reason.
    this._lightboxKeydownHandler = (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      closeBtn.focus();
    };
    document.addEventListener("keydown", this._lightboxKeydownHandler, true);

    closeBtn.focus();
  }

  closeLightbox() {
    if (!this._activeLightbox) return;
    if (this._lightboxKeydownHandler) {
      document.removeEventListener(
        "keydown",
        this._lightboxKeydownHandler,
        true
      );
      this._lightboxKeydownHandler = null;
    }
    this._activeLightbox.remove();
    this._activeLightbox = null;
    const returnFocus = /** @type {HTMLElement | null} */ (
      this._lightboxReturnFocus
    );
    this._lightboxReturnFocus = null;
    if (returnFocus?.isConnected) returnFocus.focus?.();
  }

  // The lightbox is opened *from* the inbox and the thread popover but lives
  // as their sibling in the shadow root, so a naive "is this click outside my
  // element?" test reads every click on it — including its own close button —
  // as a click away from the panel, and tears the panel down behind it.
  _isInsideLightbox(target) {
    return Boolean(target?.closest?.(`.${CLASSES.LIGHTBOX}`));
  }

  /**
   * The one lookup every id-taking method goes through. Uses sameId so a
   * legacy numeric id resolves no matter which spelling the caller holds —
   * index.d.ts promises exactly that.
   * @param {import('./index.d.ts').CommentId} id
   */
  _findComment(id) {
    return this.comments.find((c) => sameId(c.id, id));
  }

  /**
   * The hover tooltip currently open for a comment, if any. The one place
   * the `[data-for]` selector is built, so a host id carrying a quote is
   * escaped once instead of at five call sites.
   * @param {import('./index.d.ts').CommentId} id
   * @returns {HTMLElement | null}
   */
  _tooltipEl(id) {
    return (
      this.shadowRoot?.querySelector(
        `.${CLASSES.TOOLTIP}[data-for="${cssAttrValue(id)}"]`
      ) ?? null
    );
  }

  /**
   * @param {import('./index.d.ts').Comment | import('./index.d.ts').CommentId} commentOrId
   *   the live comment, or its id — every sibling mutator takes an id, so
   *   this one stopped being the exception.
   * @param {string} text
   * @param {string[]} [screenshots]
   * @returns {import('./index.d.ts').CommentReply | null} null when an id
   *   does not resolve
   */
  addReply(commentOrId, text, screenshots = []) {
    const comment =
      typeof commentOrId === "object" && commentOrId !== null
        ? commentOrId
        : this._findComment(
            /** @type {import('./index.d.ts').CommentId} */ (commentOrId)
          );
    if (!comment) return null;
    if (!comment.replies) comment.replies = [];
    const reply = {
      id: createId(),
      editedAt: null,
      text,
      author: this.options.user?.name || this.strings.anonymous,
      timestamp: new Date().toISOString(),
      screenshots,
    };
    comment.replies.push(reply);
    this._syncStorage();
    const serialized = this._serializeComment(comment);
    const serializedReply = this._serializeReply(reply);
    this._emit("reply:added", [serialized, serializedReply], {
      comment: serialized,
      reply: serializedReply,
    });
    return reply;
  }

  /**
   * Removes one reply from a thread. The root comment is untouched — deleting
   * the last reply leaves the comment itself standing, which is why this is
   * separate from deleteComment rather than a special case of it.
   *
   * @param {import('./index.d.ts').CommentId} commentId
   * @param {import('./index.d.ts').CommentId} replyId
   * @returns {boolean} false when either id does not resolve
   */
  deleteReply(commentId, replyId) {
    const comment = this._findComment(commentId);
    const index =
      comment?.replies?.findIndex((r) => sameId(r.id, replyId)) ?? -1;
    if (index < 0) return false;

    const [reply] = comment.replies.splice(index, 1);
    this._syncStorage();
    const serialized = this._serializeComment(comment);
    const serializedReply = this._serializeReply(reply);
    this._emit("reply:deleted", [serialized, serializedReply], {
      comment: serialized,
      reply: serializedReply,
    });
    return true;
  }

  /**
   * Rewrites a comment's text and stamps `editedAt`.
   *
   * Refuses an empty body: a comment with no text keeps its marker, its
   * replies and its inbox row while saying nothing, so blanking is not a
   * back door to deletion — deleting is its own action and it asks first.
   * Refuses a no-op too, so opening the editor and saving without typing
   * does not brand the comment as edited.
   *
   * @param {import('./index.d.ts').CommentId} id
   * @param {string} text
   * @returns {boolean} false when the id does not resolve, or nothing changed
   */
  editComment(id, text) {
    const comment = this._findComment(id);
    const next = String(text ?? "").trim();
    if (!comment || !next || next === comment.text) return false;

    comment.text = next;
    comment.editedAt = new Date().toISOString();
    // The marker's accessible name is the comment text — a screen-reader
    // user tabbing to it must hear the current sentence, not the old one.
    this._circles
      .get(String(comment.id))
      ?.setAttribute(
        "aria-label",
        `${this.strings.commentAriaLabelPrefix}${comment.text}`
      );
    this._syncStorage();
    const edited = this._serializeComment(comment);
    this._emit("comment:edited", [edited], { comment: edited });
    return true;
  }

  /**
   * Same contract as editComment, one level down.
   *
   * @param {import('./index.d.ts').CommentId} commentId
   * @param {import('./index.d.ts').CommentId} replyId
   * @param {string} text
   * @returns {boolean} false when either id does not resolve, or nothing changed
   */
  editReply(commentId, replyId, text) {
    const comment = this._findComment(commentId);
    const reply = comment?.replies?.find((r) => sameId(r.id, replyId));
    const next = String(text ?? "").trim();
    if (!reply || !next || next === reply.text) return false;

    reply.text = next;
    reply.editedAt = new Date().toISOString();
    this._syncStorage();
    const serialized = this._serializeComment(comment);
    const serializedReply = this._serializeReply(reply);
    this._emit("reply:edited", [serialized, serializedReply], {
      comment: serialized,
      reply: serializedReply,
    });
    return true;
  }

  _serializeReply({ id, text, author, timestamp, screenshots, editedAt }) {
    return {
      id,
      text,
      author,
      timestamp,
      screenshots: screenshots || [],
      editedAt: editedAt || null,
    };
  }

  /**
   * Serializable snapshot of one comment: the live `container` element is
   * replaced by its `anchor`. Screenshots (data-URLs) are included — the
   * localStorage mode and the inbox cards need them.
   */
  _serializeComment(comment) {
    return {
      // The anchor and context sub-objects always carried a version; the
      // comment gets one too so future breaking changes have a hinge —
      // purely additive, loadComments ignores it today.
      schemaVersion: 1,
      id: comment.id,
      text: comment.text,
      editedAt: comment.editedAt || null,
      anchor: comment.anchor || null,
      page: comment.page || location.pathname,
      replies: (comment.replies || []).map((reply) =>
        this._serializeReply(reply)
      ),
      author: comment.author,
      createdAt: comment.createdAt,
      screenshots: comment.screenshots || [],
      status: comment.status || "open",
      type: comment.type || null,
      priority: comment.priority || null,
      // Copied rather than referenced: a host mutating serializeComments()
      // output must not be able to reach back into overlay internals.
      tags: comment.tags ? [...comment.tags] : [],
      resolvedAt: comment.resolvedAt || null,
      context: comment.context ? { ...comment.context } : null,
      contextScreenshot: comment.contextScreenshot || null,
    };
  }

  /**
   * RF09 — moves a comment through its lifecycle
   * (open → in_progress → resolved → closed, in any order).
   * @param {import('./index.d.ts').CommentId} id
   * @param {import('./index.d.ts').CommentStatus} status
   * @returns {boolean} false when the id or status is unknown
   */
  setCommentStatus(id, status) {
    if (!STATUSES.includes(status)) return false;
    const comment = this._findComment(id);
    if (!comment) return false;
    // No-op: picking the status the comment is already in must not re-stamp
    // resolvedAt (that would reset RF5's elapsed time to "<1m") or trigger a
    // storage write / inbox refresh / callback for nothing having changed.
    if (comment.status === status) return true;
    comment.status = status;
    // RF5 — the timestamp always describes the CURRENT resolution: a
    // reopened comment loses it, and resolving again re-stamps it.
    comment.resolvedAt =
      status === "resolved" ? new Date().toISOString() : null;
    // Resolving removes the on-page marker; reopening restores it. The
    // lookup goes through the comment's own id, not the caller's spelling.
    const circle = this._circles.get(String(comment.id));
    if (circle) this.updateCommentPosition(comment, circle);
    this._syncStorage();
    // Re-render the inbox so the card picks up the new status right away
    // (resolved styling + sink-to-bottom sorting) no matter where the
    // change came from — card, detail or thread popover.
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    const changed = this._serializeComment(comment);
    this._emit("comment:status-changed", [changed], { comment: changed });
    return true;
  }

  /**
   * Shared tail of the classification setters: persist, re-render the
   * inbox if it's showing, and notify the host app.
   * @param {any} comment
   * @returns {true}
   */
  _commitUpdate(comment) {
    this._syncStorage();
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    const updated = this._serializeComment(comment);
    this._emit("comment:updated", [updated], { comment: updated });
    return true;
  }

  /**
   * RF3 — categorises a comment. `null` returns it to the neutral state.
   * @param {import('./index.d.ts').CommentId} id
   * @param {import('./index.d.ts').CommentType | null} type
   * @returns {boolean} false when the id or type is unknown
   */
  setCommentType(id, type) {
    if (type !== null && !COMMENT_TYPES.includes(type)) return false;
    const comment = this._findComment(id);
    if (!comment) return false;
    comment.type = type;
    return this._commitUpdate(comment);
  }

  /**
   * RF4 — prioritises a comment. `null` returns it to the neutral state.
   * @param {import('./index.d.ts').CommentId} id
   * @param {import('./index.d.ts').CommentPriority | null} priority
   * @returns {boolean} false when the id or priority is unknown
   */
  setCommentPriority(id, priority) {
    if (priority !== null && !PRIORITIES.includes(priority)) return false;
    const comment = this._findComment(id);
    if (!comment) return false;
    comment.priority = priority;
    return this._commitUpdate(comment);
  }

  /**
   * RF3 — replaces a comment's free-form labels. Values are trimmed,
   * lowercased and de-duplicated.
   * @param {import('./index.d.ts').CommentId} id
   * @param {string[]} tags
   * @returns {boolean} false when the id is unknown or tags isn't an array
   */
  setCommentTags(id, tags) {
    if (!Array.isArray(tags)) return false;
    const comment = this._findComment(id);
    if (!comment) return false;
    comment.tags = normalizeTags(tags);
    return this._commitUpdate(comment);
  }

  /**
   * @returns {import('./index.d.ts').SerializedComment[]}
   */
  serializeComments() {
    return this.comments.map((comment) => this._serializeComment(comment));
  }

  /**
   * Removes a comment everywhere: page marker, memory and (when the
   * localStorage mode is on) persisted storage.
   * @param {import('./index.d.ts').CommentId} id
   * @returns {boolean} false when the id is unknown
   */
  deleteComment(id) {
    if (!this._findComment(id)) return false;
    this._removeComment(id);
    if (this.options.persistence === "localStorage") {
      // The merge preserves other-page entries missing from memory, which
      // would resurrect a deleted inactive comment — drop the id explicitly.
      const merged = mergeForStorage(
        this._readStoredCached().filter((comment) => !sameId(comment.id, id)),
        this.serializeComments(),
        location.pathname
      );
      writeStoredComments(merged);
      this._storedCache = merged;
    }
    this._emit("comment:deleted", [id], { id });
    return true;
  }

  _removeComment(id) {
    this.markers.remove(id);
    this.comments = this.comments.filter((comment) => !sameId(comment.id, id));
  }

  /**
   * Removes every comment at once — markers, memory and (in localStorage
   * mode) their persisted entries. This is the bulk reset a host needs to
   * reconcile against its backend before a fresh loadComments, so it
   * deliberately fires no per-comment onCommentDeleted callbacks: the host
   * initiated it and would only hear its own action echoed back.
   */
  clearComments() {
    this.closeThreadPopover();
    const cleared = this.comments;
    this.markers.clear();
    this.comments = [];

    if (this.options.persistence === "localStorage" && cleared.length > 0) {
      const clearedIds = new Set(cleared.map((comment) => String(comment.id)));
      const merged = this._readStoredCached().filter(
        (comment) => !clearedIds.has(String(comment.id))
      );
      writeStoredComments(merged);
      this._storedCache = merged;
    }
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
  }

  /**
   * Restores serialized comments: each anchor is resolved back to a live
   * element (circle re-rendered) or the comment is kept as an orphan —
   * present in the list/inbox but never positioned over the wrong element.
   * Loading the same id again replaces the previous copy (idempotent).
   * @param {import('./index.d.ts').SerializedComment[]} data
   * @returns {{ anchored: number, orphaned: number, inactive: number }}
   */
  loadComments(data) {
    let anchored = 0;
    let orphaned = 0;
    let inactive = 0;
    if (!Array.isArray(data)) return { anchored, orphaned, inactive };

    for (const item of data) {
      if (!item || item.id == null || typeof item.text !== "string") {
        console.warn("HellDots: skipping malformed serialized comment", item);
        continue;
      }
      this._removeComment(item.id);

      const comment = {
        id: item.id,
        text: item.text,
        editedAt: item.editedAt || null,
        anchor: item.anchor || null,
        anchorState: "orphaned",
        target: null,
        hidden: false,
        page: item.page || location.pathname,
        container: null,
        relativeX: 0,
        relativeY: 0,
        // Same minimal gate the top-level comment passes (id + text):
        // a malformed reply would otherwise flow into every renderer.
        replies: Array.isArray(item.replies)
          ? item.replies
              .filter(
                (reply) =>
                  reply &&
                  typeof reply === "object" &&
                  reply.id != null &&
                  typeof reply.text === "string"
              )
              .map((reply) =>
                Array.isArray(reply.screenshots)
                  ? {
                      ...reply,
                      screenshots: onlyStrings(reply.screenshots),
                    }
                  : reply
              )
          : [],
        author: item.author || this.strings.anonymous,
        createdAt: item.createdAt || new Date().toISOString(),
        // Screenshots land in <img src> as-is — a non-string entry renders
        // a silently broken thumbnail.
        screenshots: Array.isArray(item.screenshots)
          ? onlyStrings(item.screenshots)
          : [],
        // "closed" existed briefly and was folded into "resolved".
        status:
          /** @type {string} */ (item.status) === "closed"
            ? "resolved"
            : STATUSES.includes(item.status)
              ? item.status
              : "open",
        // Records persisted before RF1-RF5 have none of these — every
        // reader downstream may assume they exist after this point.
        type: COMMENT_TYPES.includes(item.type) ? item.type : null,
        priority: PRIORITIES.includes(item.priority) ? item.priority : null,
        tags: Array.isArray(item.tags) ? [...item.tags] : [],
        resolvedAt: item.resolvedAt || null,
        context: item.context || null,
        contextScreenshot: item.contextScreenshot || null,
      };

      // Comments from other pages aren't broken — their elements just
      // don't exist here. They stay listed (inbox "all" filter) without a
      // marker and without an onAnchorLost false alarm.
      if (item.page && item.page !== location.pathname) {
        comment.anchorState = "inactive";
        this.comments.push(comment);
        inactive++;
        continue;
      }

      const resolved = item.anchor ? resolveAnchor(item.anchor) : null;
      if (resolved) {
        comment.container = resolved.element;
        comment.relativeX = item.anchor.relativeX;
        comment.relativeY = item.anchor.relativeY;
        comment.anchorState = "anchored";
        this.comments.push(comment);
        this.renderCommentCircle(comment);
        anchored++;
      } else {
        this.comments.push(comment);
        orphaned++;
        const lost = this._serializeComment(comment);
        this._emit("comment:anchor-lost", [lost], { comment: lost });
      }
    }

    // A link the host's data had not arrived for yet may be waiting on
    // exactly the comments that just landed.
    this._openPendingDetail();

    return { anchored, orphaned, inactive };
  }

  /**
   * Re-syncs the widget after a client-side navigation: reclassifies every
   * comment against the new `location.pathname`, re-resolves anchors
   * against the new DOM, rebuilds markers, and moves the inbox onto the
   * new page. Call it from the router's "after navigation" hook; with
   * `autoDetectNavigation` it also runs on popstate (back/forward).
   *
   * Same-path calls are useful too: an SPA that re-rendered its route
   * swapped every node, and this is the "re-anchor now" primitive.
   *
   * @returns {{ anchored: number, orphaned: number, inactive: number }}
   */
  notifyNavigation() {
    const page = location.pathname;
    let anchored = 0;
    let orphaned = 0;
    let inactive = 0;

    // Panels pinned to the old DOM don't survive a route change; the inbox
    // does — it is cross-page by design and refreshes below.
    this.closeThreadPopover();
    this.hideCommentBox();
    if (this.inboxView) this.inboxView.currentPage = page;

    for (const comment of this.comments) {
      this.markers.remove(comment.id);
      comment.hidden = false;
      comment.target = null;
      comment._occluded = false;

      if (comment.page && comment.page !== page) {
        comment.anchorState = "inactive";
        comment.container = null;
        inactive++;
        continue;
      }

      const resolved = comment.anchor ? resolveAnchor(comment.anchor) : null;
      if (resolved) {
        comment.container = resolved.element;
        comment.relativeX = comment.anchor.relativeX;
        comment.relativeY = comment.anchor.relativeY;
        comment.anchorState = "anchored";
        this.renderCommentCircle(comment);
        anchored++;
      } else {
        // Same contract as loadComments: kept and listed, never positioned
        // over a guessed element — and the host is told, each time, because
        // "the element is gone on this visit" is fresh information.
        comment.container = null;
        comment.anchorState = "orphaned";
        orphaned++;
        const lost = this._serializeComment(comment);
        this._emit("comment:anchor-lost", [lost], { comment: lost });
      }
    }

    // The new URL may itself carry a deep link (a copy-link opened through
    // the SPA's router) or the cross-page handoff written just before the
    // host navigated.
    this._pendingDetailId = this._readPendingDetailId();
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    this._openPendingDetail();

    return { anchored, orphaned, inactive };
  }

  scrollMarkerIntoView(comment) {
    this.markers.scrollMarkerIntoView(comment);
  }

  createPreviewCircle(x, y) {
    this.removePreviewCircle();

    const circle = document.createElement("div");
    circle.className = `${CLASSES.CIRCLE} ${CLASSES.PREVIEW_CIRCLE}`;
    circle.style.position = "absolute";
    const circleRadius = MARKER_SIZE / 2;
    circle.style.left = `${x + circleRadius}px`;
    circle.style.top = `${y + circleRadius}px`;
    circle.style.transform = "translate(-50%, -50%)";
    circle.style.pointerEvents = "none";

    this.overlay.appendChild(circle);
    this.previewCircle = circle;
  }

  removePreviewCircle() {
    this.previewCircle?.remove();
    this.previewCircle = null;
  }

  // ------------------------------------------------------------------
  // Marker facade — the engine owns the logic (marker-engine.js); these
  // keep the overlay-level names every internal caller and the test suite
  // grew around. State fields surface as accessors for the same reason.
  // ------------------------------------------------------------------

  cleanupResizeObserver(commentId) {
    this.markers.cleanupResizeObserver(commentId);
  }

  validateAndCalculatePosition(comment, circle) {
    return this.markers.validateAndCalculatePosition(comment, circle);
  }

  updateCommentPosition(comment, circle) {
    this.markers.updatePosition(comment, circle);
  }

  scheduleUpdatePositions() {
    this.markers.scheduleUpdate();
  }

  /** Marker circles by String(id) — lives on the engine. */
  get _circles() {
    return this.markers?.circles;
  }

  /** Per-comment ResizeObservers — live on the engine. */
  get resizeObservers() {
    return this.markers?.resizeObservers;
  }

  get positionValidationEnabled() {
    return this.markers?.enabled ?? true;
  }

  set positionValidationEnabled(value) {
    if (this.markers) this.markers.enabled = value;
  }

  get _globalMutationObserver() {
    return this.markers?._globalMutationObserver ?? null;
  }

  // A marker that just went away must not leave its hover tooltip or its
  // open thread popover floating on the page (e.g. above the modal that
  // now covers the marker).
  _dismissMarkerUi(comment) {
    this._tooltipEl(comment.id)?.remove();
    if (this.activeThreadPopover?.dataset.for === String(comment.id)) {
      this.closeThreadPopover();
    }
  }

  /**
   * Cleanup method to remove all event listeners and observers
   */
  cleanup() {
    // An instance destroyed while the document is still loading must not
    // mount when DOMContentLoaded eventually fires.
    if (this._onDomReady) {
      document.removeEventListener("DOMContentLoaded", this._onDomReady);
      this._onDomReady = null;
    }
    // Cancels every scheduled pass, listener, observer and circle the
    // marker engine owns — including a rAF armed before teardown.
    this.markers?.destroy();
    if (this._storageHandler) {
      window.removeEventListener("storage", this._storageHandler);
      this._storageHandler = null;
    }
    if (this._popstateHandler) {
      window.removeEventListener("popstate", this._popstateHandler);
      this._popstateHandler = null;
    }
    this._storedCache = null;
    // Dropping the panels leaves their dropdowns detached-but-open, which
    // would keep the menu registry's document listener alive until the next
    // stray mousedown.
    closeOpenMenus();
    // Same reasoning: an unanswered confirmation holds a capture-phase
    // keydown listener on document, which would go on eating Escape for the
    // whole page after the widget is gone.
    closeOpenConfirmDialogs();
    this.closeThreadPopover();
    this.closeInbox();
    this.closeLightbox();
    this.removePreviewCircle();
    // Covers the selection rect, the drag listeners and the pending capture.
    this._captureFlow?.destroy();
    this._pendingScreenshots = [];

    if (this._handleDocumentClickBound) {
      document.removeEventListener("mousedown", this._handleDocumentClickBound);
    }

    // Remove keyboard shortcut handler
    if (this.keydownHandler) {
      document.removeEventListener("keydown", this.keydownHandler);
    }

    // Remove DOM elements
    if (this.toolbar && this.toolbar.parentNode) {
      this.toolbar.parentNode.removeChild(this.toolbar);
    }
    if (this.commentBox && this.commentBox.parentNode) {
      this.commentBox.parentNode.removeChild(this.commentBox);
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }

    document.body.classList.remove(CLASSES.COMMENT_CURSOR);
    // Covers both paths: removes the injected <style> or drops our adopted
    // sheet from the document. Leaving the latter behind would keep styling
    // the host page — the comment-mode cursor included — after teardown.
    this._detachStyles();

    // The now-empty shadow host itself: leaving <helldots-root> dangling
    // from <body> is half a cleanup. getShadowRoot() recreates it if a new
    // instance mounts later.
    document.querySelector(TAG_NAME)?.remove();
  }

  injectStyles() {
    // Re-injecting replaces rather than accumulates, whichever path is in
    // use — mountStyles hands back the undo for exactly what it mounted.
    this._detachStyles();
    this._styleDetachers = [
      mountStyles(this.shadowRoot, getStyles(), IDS.STYLES),
      // A few rules (e.g. the comment-mode cursor on document.body) target
      // the host page itself, which a shadow root's stylesheet cannot
      // reach — those go on the document instead.
      mountStyles(document, getGlobalStyles(), IDS.GLOBAL_STYLES),
    ];
  }

  _detachStyles() {
    for (const detach of this._styleDetachers ?? []) detach();
    this._styleDetachers = [];
  }
}

export default CommentOverlay;
