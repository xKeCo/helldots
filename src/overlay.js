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
  actorKeyOf,
  toggleReactionOn,
  normalizeReactions,
  serializeReactions,
} from "./reactions.js";
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
import {
  actorOf,
  recordEvent,
  normalizeHistory,
  serializeHistory,
} from "./audit.js";
import { normalizeActorId } from "./id.js";
import { computeMetrics } from "./metrics.js";
import {
  toCsv,
  columnsOf,
  commentRows,
  metricRows,
  downloadCsv,
  COMMENT_COLUMNS,
  METRIC_COLUMNS,
} from "./csv.js";
import { printMetricsReport } from "./metrics-report.js";
import { getReportStyles } from "./styles.js";
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
  "reaction:toggled": "onReactionToggled",
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
      embedCrossOriginFonts: options.embedCrossOriginFonts === true,
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

    /**
     * The pending id the host was already asked to fetch. A link pointing at
     * a comment that never arrives must ask once, not once per load.
     * @type {string | null}
     */
    this._requestedDetailId = null;

    /**
     * Where the mutation being applied right now came from. "host" is the
     * default because a public method reached directly IS the host calling
     * it; the widget's own UI goes through `_asUser`, which flips this for
     * the duration of the call.
     * @type {import('./index.d.ts').ChangeOrigin}
     */
    this._origin = "host";

    /**
     * Comments handed to loadComments() before the widget mounted, replayed
     * by initOverlay() once the marker engine exists.
     * @type {import('./index.d.ts').SerializedComment[] | null}
     */
    this._deferredLoad = null;

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
      embedCrossOriginFonts: this.options.embedCrossOriginFonts,
      // The pending-attachments array stays here, next to the comment box
      // that previews it — the flow only reports what a drag captured.
      onRegionCaptured: (dataUrl) => {
        if (!this._pendingScreenshots) this._pendingScreenshots = [];
        if (this._pendingScreenshots.length < MAX_SCREENSHOTS) {
          this._pendingScreenshots.push(dataUrl);
        }
      },
      onPlace: (x, y) => this._placeCommentAtPoint(x, y),
      onError: (err) => this._reportError(err, "capture"),
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
      actorKey: () => this._actorKey(),
      // Every action below is a person clicking inside the widget, so the
      // events they emit carry origin "user" (see _asUser).
      actions: this._userActions({
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
        toggleCommentReaction: (id, emoji) =>
          this.toggleCommentReaction(id, emoji),
        toggleReplyReaction: (commentId, replyId, emoji) =>
          this.toggleReplyReaction(commentId, replyId, emoji),
      }),
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

    // A host whose fetch resolved while the document was still parsing
    // called loadComments() before any of this existed. Applied here, after
    // the localStorage restore, so explicit data still wins by id over
    // whatever was cached.
    if (this._deferredLoad) {
      const deferred = this._deferredLoad;
      this._deferredLoad = null;
      this.loadComments(deferred);
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

    this._notifyReady();
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
      this._requestPendingDetail(id);
      return;
    }

    this._pendingDetailId = null;
    this._requestedDetailId = null;
    this.showInbox();
    this.inboxView.clearNotice();
    this.inboxView.openDetail(comment.id);
  }

  /**
   * Asks the host for a comment a link points at that the widget does not
   * hold.
   *
   * This is what makes "load only the comment in the link" implementable. A
   * host that fetches per page otherwise has no way to learn which id the
   * URL asked for except re-parsing the query string with its own copy of
   * `linkParam` — a second spelling of the same setting, free to drift from
   * the one the widget actually uses.
   *
   * Asked once per id rather than once per attempt: `_openPendingDetail`
   * runs again after every load and after every navigation, and an id the
   * host cannot produce must not become a request loop.
   *
   * A handler returning a promise is awaited and the link retried once it
   * settles — on rejection too, since the comment may have arrived by
   * another route while the fetch was failing.
   *
   * @param {string} id the pending id, as the URL or the handoff spelled it
   */
  _requestPendingDetail(id) {
    const handler = this.options.onCommentRequested;
    if (typeof handler !== "function") return;
    if (this._requestedDetailId !== null && sameId(this._requestedDetailId, id))
      return;
    this._requestedDetailId = id;

    let result;
    try {
      result = handler(id);
    } catch (err) {
      this._reportError(err, "link");
      return;
    }
    if (!result || typeof (/** @type {any} */ (result).then) !== "function") {
      return;
    }
    /** @type {Promise<unknown>} */ (result).then(
      () => this._openPendingDetail(),
      (err) => {
        this._reportError(err, "link");
        this._openPendingDetail();
      }
    );
  }

  /**
   * Announces that the widget is mounted and every method on it is safe to
   * call. Fires once, at the end of initOverlay — synchronously inside the
   * constructor when the document was already parsed, on DOMContentLoaded
   * when it was not. The instance is handed over because in the synchronous
   * case the host does not have the return value of createCommentOverlay()
   * yet.
   */
  _notifyReady() {
    const handler = this.options.onReady;
    if (typeof handler !== "function") return;
    try {
      handler(this);
    } catch (err) {
      console.warn("HellDots: onReady handler threw", err);
    }
  }

  /**
   * Runs a mutation performed by the widget's own UI, so everything emitted
   * inside it is stamped `origin: "user"`. A call arriving from the host's
   * code never passes through here and stays `"host"` — which is the whole
   * of how the two are told apart, since the inbox and the thread popover
   * drive the very same public methods a host does.
   *
   * Restores the previous value rather than resetting to "host": the inbox
   * calls a public method that itself reaches another one, and the inner
   * call must not downgrade the outer one's origin.
   *
   * @template T
   * @param {() => T} fn
   * @returns {T}
   */
  _asUser(fn) {
    const previous = this._origin;
    this._origin = "user";
    try {
      return fn();
    } finally {
      this._origin = previous;
    }
  }

  /**
   * Wraps every function of an adapter object so the UI that calls it is
   * recorded as the origin. One call site per adapter instead of one per
   * action: a new action added to the inbox or the popover is stamped
   * without anyone having to remember to stamp it.
   *
   * @template {Record<string, any>} T
   * @param {T} actions
   * @returns {T}
   */
  _userActions(actions) {
    /** @type {Record<string, any>} */
    const wrapped = {};
    for (const [key, value] of Object.entries(actions)) {
      wrapped[key] =
        typeof value === "function"
          ? (/** @type {any[]} */ ...args) => this._asUser(() => value(...args))
          : value;
    }
    return /** @type {T} */ (wrapped);
  }

  /**
   * Tells the host about a failure it would otherwise only find in the
   * console. Every one of these is already survivable — the widget carries
   * on regardless — but "the screenshot pipeline is broken" is not something
   * a feedback tool should keep to itself.
   *
   * The console warning stays: a host without an `onError` must not lose the
   * diagnostic, and one with it is usually logging rather than replacing.
   *
   * @param {unknown} error
   * @param {import('./index.d.ts').ErrorContext} context
   */
  _reportError(error, context) {
    const handler = this.options.onError;
    if (typeof handler !== "function") return;
    try {
      handler(error, context);
    } catch (err) {
      console.warn("HellDots: onError handler threw", err);
    }
  }

  /**
   * Hands one image to the host's `transformScreenshot`, so what ends up
   * stored can be a URL into its own storage instead of ~33KB of base64 in
   * every record.
   *
   * Never rejects, and never returns something a renderer cannot use: a
   * bucket that is down must not cost the user their comment, so a failed
   * transform degrades to the data URL the widget already holds and reports
   * itself through onError instead. The host receives a fat record rather
   * than none — the better of two bad outcomes.
   *
   * @param {string | null} dataUrl null passes straight through: no capture
   *   was taken, and there is nothing to transform.
   * @param {"context" | "attachment"} kind
   * @param {import('./index.d.ts').CommentId} commentId
   * @returns {Promise<string | null>}
   */
  async _transformScreenshot(dataUrl, kind, commentId) {
    const transform = this.options.transformScreenshot;
    if (typeof transform !== "function" || !dataUrl) return dataUrl;
    try {
      const result = await transform(dataUrl, { kind, commentId });
      // A handler resolving to nothing usable is a failed handler; storing
      // it would put a broken <img> where the screenshot was.
      if (typeof result !== "string" || !result) {
        throw new Error(
          "HellDots: transformScreenshot resolved to no usable string"
        );
      }
      return result;
    } catch (err) {
      this._reportError(err, "transform");
      return dataUrl;
    }
  }

  /**
   * The one place a change leaves the widget. Fires the specific callback
   * that has always carried this event and then the onChange stream, so a
   * host can subscribe either way — or both — and never sees the two
   * disagree about what happened or when.
   *
   * Both shapes also receive the same `meta`: the specific callback takes it
   * as one extra trailing argument (existing handlers ignore it — that is
   * what makes this additive), and `onChange` gets its fields flattened onto
   * the event, alongside `comment`/`reply`/`id`.
   *
   * Host handlers are isolated: a subscriber that throws must not roll back
   * a mutation that already happened, and must not stop its sibling from
   * hearing about it either.
   *
   * @param {keyof typeof CHANGE_CALLBACKS} type
   * @param {any[]} callbackArgs arguments for the specific callback, in the
   *   order it has always taken them
   * @param {Object} payload the event's own fields, minus `type`
   * @param {Object} [detail] event-specific metadata (`field`, `from`, `to`)
   *   to travel next to `origin`
   */
  _emit(type, callbackArgs, payload, detail) {
    const meta = { origin: this._origin, ...detail };
    const name = CHANGE_CALLBACKS[type];
    const callback = this.options[name];
    if (typeof callback === "function") {
      try {
        callback(...callbackArgs, meta);
      } catch (err) {
        console.warn(`HellDots: ${name} handler threw`, err);
      }
    }
    if (typeof this.options.onChange === "function") {
      try {
        this.options.onChange({ type, ...payload, ...meta });
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
    if (!writeStoredComments(merged)) {
      // Already warned about in detail by the writer, which shed what it
      // could before giving up. Worth surfacing anyway: from here on this
      // browser's copy silently diverges from what the user can see.
      this._reportError(
        new Error("HellDots: comments could not be persisted to localStorage"),
        "storage"
      );
    }
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

    // Every path lands here — the toolbar button, the keyboard shortcut, the
    // inbox empty state, and the automatic switch-off after a save — so the
    // host hears about the mode however it was flipped, including by the
    // shortcut it never sees.
    this._notify("onCommentModeChanged", [this.commentMode]);
  }

  async saveComment() {
    // Two Enters while the capture resolves must not save twice.
    if (this._saving) return;
    if (!this.commentInput.value.trim() || !this.currentPosition) return;
    this._saving = true;
    // The guard above already made the second click a no-op; disabling says
    // so. With a host's upload behind the save this is no longer instant,
    // and a button that looks live but does nothing reads as broken.
    if (this.submitButton) this.submitButton.disabled = true;
    try {
      await this._saveCommentNow();
    } finally {
      this._saving = false;
      if (this.submitButton) this.submitButton.disabled = false;
    }
  }

  async _saveCommentNow() {
    // The capture kicked off when the box opened; by save time it has
    // usually resolved and this await costs nothing.
    const captured = await this._captureFlow.consumePending();
    // The box may have been dismissed (Escape) while awaiting — a save that
    // lands after that would contradict what the user sees on screen.
    if (!this.currentPosition) return;

    // Generated ahead of the transform rather than inside the object below,
    // so a host can name its blobs after the comment they belong to.
    const id = createId();
    const attachments = this._pendingScreenshots
      ? [...this._pendingScreenshots]
      : [];

    // In parallel: up to six images, one wait rather than six.
    const [contextScreenshot, screenshots] = await Promise.all([
      this._transformScreenshot(captured, "context", id),
      Promise.all(
        attachments.map((dataUrl) =>
          this._transformScreenshot(dataUrl, "attachment", id)
        )
      ),
    ]);

    // Checked again: unlike the capture above, the transform is the host's
    // network, so the box has had a real chance to be dismissed under it.
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
      id,
      replies: [],
      author: this.options.user?.name || this.strings.anonymous,
      authorId: normalizeActorId(this.options.user?.id) || null,
      createdAt: new Date().toISOString(),
      screenshots,
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

    recordEvent(comment, "created", this._actor());

    this.comments.push(comment);
    this._syncStorage();
    const created = this._serializeComment(comment);
    // The comment box is widget UI like any other, but it reaches _emit
    // directly instead of through an adapter, so it stamps its own origin.
    this._asUser(() =>
      this._emit("comment:created", [created], { comment: created })
    );
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
        // Same as the popover's: everything here is user-driven.
        callbacks: this._userActions({
          onActivateCommentMode: () => {
            this.closeInbox();
            // Never a toggle: the button reads "turn on comment mode", so
            // pressing it while the mode is already on must not turn it off.
            if (!this.commentMode) this.toggleCommentMode();
          },
          onOpenDetailScroll: (comment) => this.scrollMarkerIntoView(comment),
          onOpenDetail: (comment) => this._notifyCommentOpened(comment),
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
          actorKey: () => this._actorKey(),
          onToggleCommentReaction: (id, emoji) =>
            this.toggleCommentReaction(id, emoji),
          onToggleReplyReaction: (commentId, replyId, emoji) =>
            this.toggleReplyReaction(commentId, replyId, emoji),
          onExportComments: (comments) => this.exportCommentsCsv(comments),
          onExportMetrics: (comments) => this.exportMetricsCsv(comments),
          onPrintReport: (comments, scope) =>
            this.printMetricsReport(comments, scope),
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
        }),
      });
    }
    this.inboxView.open();

    // Both fields hold one thing, so whatever is already in them has to go
    // first: re-opening an open inbox (notifyNavigation re-reads the deep
    // link on every route change) otherwise orphaned the previous timer and
    // handler where closeInbox could no longer reach them.
    this._disarmInboxOutsideClick();

    // Deferred like the thread popover's, and cancellable for the same
    // reason: closeInbox() (via cleanup(), or a host that opens and unmounts
    // in one tick) may run before the timer, and a listener installed after
    // that has nothing left to remove it.
    this._inboxClickTimer = setTimeout(() => {
      this._inboxClickTimer = null;
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
    this._disarmInboxOutsideClick();
  }

  /**
   * Drops the inbox's outside-click listener, whether it is already on
   * `document` or still sitting in a pending timer. One place, so re-opening
   * and closing cannot each remember a different half of it.
   */
  _disarmInboxOutsideClick() {
    if (this._inboxClickTimer) {
      clearTimeout(this._inboxClickTimer);
      this._inboxClickTimer = null;
    }
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
    this._notifyCommentOpened(comment);
  }

  /**
   * Someone is now looking at a comment's full thread — from its marker or
   * from the inbox detail, which are the only two places the replies are
   * readable. This is the signal an unread count is built on; the widget
   * keeps no read state of its own, because whose "read" it is depends on an
   * identity only the host can persist.
   *
   * @param {any} comment the live comment, serialized on the way out like
   *   every other payload that crosses this boundary
   */
  _notifyCommentOpened(comment) {
    if (!comment) return;
    this._notify("onCommentOpened", [this._serializeComment(comment)]);
  }

  /**
   * Calls one of the options that is not part of the change stream, with the
   * same isolation `_emit` gives the ones that are: a subscriber that throws
   * must not take down the operation that was reporting to it.
   *
   * @param {"onCommentModeChanged" | "onCommentOpened"} name
   * @param {any[]} args
   */
  _notify(name, args) {
    // Cast: the two options have different signatures, so the union of them
    // takes no spread. The call sites below are the only ones, and each
    // passes what its own option declares.
    const handler = /** @type {any} */ (this.options[name]);
    if (typeof handler !== "function") return;
    try {
      handler(...args);
    } catch (err) {
      console.warn(`HellDots: ${name} handler threw`, err);
    }
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
      authorId: normalizeActorId(this.options.user?.id) || null,
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
    // The text itself is deliberately not recorded: the log says who changed
    // what and when, and keeping every superseded revision would turn it into
    // a second copy of the corpus.
    recordEvent(comment, "edited", this._actor());
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

  _serializeReply({
    id,
    text,
    author,
    authorId,
    timestamp,
    screenshots,
    editedAt,
    // Defaulted, not just optional: addReply builds a reply without the field,
    // and a fresh reply has nothing to serialize yet.
    reactions = null,
  }) {
    return {
      id,
      text,
      author,
      authorId: authorId || null,
      timestamp,
      screenshots: screenshots || [],
      editedAt: editedAt || null,
      reactions: serializeReactions(reactions),
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
      // Identity, not copy: the display name is what any renderer shows, and
      // this is what a host correlates against its own user table.
      authorId: comment.authorId || null,
      // Copied out for the same reason as tags and reactions, and null rather
      // than [] when nothing was recorded, so an untouched corpus costs no
      // extra bytes.
      history: serializeHistory(comment.history),
      createdAt: comment.createdAt,
      screenshots: comment.screenshots || [],
      status: comment.status || "open",
      type: comment.type || null,
      priority: comment.priority || null,
      // Copied rather than referenced: a host mutating serializeComments()
      // output must not be able to reach back into overlay internals.
      tags: comment.tags ? [...comment.tags] : [],
      // Copied for the same reason as `tags`, and null rather than `{}` when
      // nobody reacted, so an untouched corpus costs no extra bytes.
      reactions: serializeReactions(comment.reactions),
      resolvedAt: comment.resolvedAt || null,
      context: comment.context ? { ...comment.context } : null,
      contextScreenshot: comment.contextScreenshot || null,
    };
  }

  /**
   * RF09 — moves a comment through its lifecycle
   * (open → in_progress → in_review → resolved, in any order).
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
    const previous = comment.status;
    comment.status = status;
    // RF5 — the timestamp always describes the CURRENT resolution: a
    // reopened comment loses it, and resolving again re-stamps it.
    comment.resolvedAt =
      status === "resolved" ? new Date().toISOString() : null;
    // After the no-op guard above, never before it: an entry recorded there
    // would log a change that did not happen.
    recordEvent(comment, "status", this._actor(), {
      from: previous,
      to: status,
    });
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
    // Both ends of the move, the same pair the audit entry just recorded: a
    // host routing "reopened" or "resolved" differently should not have to
    // diff against its own previous copy to find out which one happened.
    this._emit(
      "comment:status-changed",
      [changed],
      { comment: changed },
      {
        from: previous,
        to: status,
      }
    );
    return true;
  }

  /**
   * Replaces the identity new comments, replies and reactions are attributed
   * to. Everything already recorded keeps the author it was written with —
   * this is a change of who is acting now, not a rewrite of history.
   *
   * Exists because identity commonly arrives *after* the widget: the overlay
   * mounts, the session resolves 200ms later, and the alternative was
   * `cleanup()` plus a rebuild — which throws away every loaded comment and
   * whatever panel was open. Passing `null` returns to the anonymous author.
   *
   * @param {{ name: string, id?: string } | null} [user]
   * @returns {boolean} false when the argument is neither null nor an object
   *   carrying a usable name
   */
  setUser(user) {
    if (user != null) {
      if (typeof user !== "object") return false;
      if (typeof user.name !== "string" || !user.name.trim()) return false;
    }
    this.options.user = user ?? undefined;
    // Both panels read the actor through a function rather than a captured
    // value, so all they need is a re-render: which reactions are shown as
    // the current user's own changes with the identity.
    this._popover?.close();
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    return true;
  }

  /**
   * The current actor as the audit log records them: id when the host
   * supplies one, plus the display name. Sibling of _actorKey — one produces
   * a de-duplication key, the other a record meant to be read back.
   * @returns {{ id?: string, name: string }}
   */
  _actor() {
    return actorOf(this.options.user, this.strings);
  }

  /**
   * The key the current actor's reactions are stored under. `user.id` when the
   * host supplies one, the display name otherwise — see actorKeyOf, which is
   * the only place this is decided so the toggle and the "mine" render can
   * never disagree.
   * @returns {string}
   */
  _actorKey() {
    return actorKeyOf(this.options.user, this.strings);
  }

  /**
   * Shared tail of both reaction toggles: persist, keep an open inbox in step,
   * and hand the host the comment plus whichever reply carried the reaction.
   * @param {any} comment
   * @param {any | null} reply
   * @returns {true}
   */
  _commitReaction(comment, reply) {
    this._syncStorage();
    // A pill lives on the card, in the detail and in the popover at once, so a
    // toggle anywhere has to reach the copies it did not repaint itself.
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    const serialized = this._serializeComment(comment);
    const serializedReply = reply ? this._serializeReply(reply) : null;
    this._emit("reaction:toggled", [serialized, serializedReply], {
      comment: serialized,
      reply: serializedReply,
    });
    return true;
  }

  /**
   * Flips the current actor's reaction on a comment: present, it is removed;
   * absent, it is added.
   * @param {import('./index.d.ts').CommentId} id
   * @param {string} emoji one of REACTION_EMOJIS
   * @returns {boolean} false when the id or the emoji is unknown
   */
  toggleCommentReaction(id, emoji) {
    const comment = this._findComment(id);
    if (!comment) return false;
    if (!toggleReactionOn(comment, emoji, this._actorKey())) return false;
    return this._commitReaction(comment, null);
  }

  /**
   * Same contract as toggleCommentReaction, one level down.
   * @param {import('./index.d.ts').CommentId} commentId
   * @param {import('./index.d.ts').CommentId} replyId
   * @param {string} emoji one of REACTION_EMOJIS
   * @returns {boolean} false when either id, or the emoji, is unknown
   */
  toggleReplyReaction(commentId, replyId, emoji) {
    const comment = this._findComment(commentId);
    const reply = comment?.replies?.find((r) => sameId(r.id, replyId));
    if (!reply) return false;
    if (!toggleReactionOn(reply, emoji, this._actorKey())) return false;
    return this._commitReaction(comment, reply);
  }

  /**
   * Shared tail of the classification setters: persist, re-render the
   * inbox if it's showing, and notify the host app.
   * @param {any} comment
   * @returns {true}
   */
  /**
   * @param {any} comment
   * @param {{ field: "type" | "priority" | "tags", from?: any, to?: any }} detail
   *   which field moved, and both ends of the move where there are two. The
   *   setters already compute this for the audit trail; passing it on costs
   *   nothing and saves every host the same diff.
   */
  _commitUpdate(comment, detail) {
    this._syncStorage();
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    const updated = this._serializeComment(comment);
    this._emit("comment:updated", [updated], { comment: updated }, detail);
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
    const previousType = comment.type ?? null;
    // The same no-op guard setCommentStatus has always had. Without it,
    // re-applying the value a comment already holds wrote to storage,
    // refreshed the inbox and emitted comment:updated for nothing — which a
    // host mirroring a remote change hears as its own echo.
    if (previousType === type) return true;
    comment.type = type;
    recordEvent(comment, "classified", this._actor(), {
      field: "type",
      from: previousType,
      to: type,
    });
    return this._commitUpdate(comment, {
      field: "type",
      from: previousType,
      to: type,
    });
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
    const previousPriority = comment.priority ?? null;
    if (previousPriority === priority) return true;
    comment.priority = priority;
    recordEvent(comment, "classified", this._actor(), {
      field: "priority",
      from: previousPriority,
      to: priority,
    });
    return this._commitUpdate(comment, {
      field: "priority",
      from: previousPriority,
      to: priority,
    });
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
    // Joined on a character no tag can contain, rather than compared with
    // JSON: the list is already normalised on both sides, so this is the
    // whole of "did anything actually change".
    const previous = [...(comment.tags || [])];
    const previousKey = previous.join("\u0000");
    const next = normalizeTags(tags);
    if (next.join("\u0000") === previousKey) return true;
    comment.tags = next;
    recordEvent(comment, "classified", this._actor(), { field: "tags" });
    // Tags are a list, so unlike type and priority they have no two-value
    // transition to record in the audit trail — but a host diffing "which
    // label was added" still wants both sides, and here they are.
    return this._commitUpdate(comment, {
      field: "tags",
      from: previous,
      to: [...next],
    });
  }

  /**
   * Aggregate figures over every comment the widget holds — counts by
   * status, type and priority, the daily distribution, and the resolution
   * times derived from the audit log.
   *
   * Unfiltered on purpose: a host has no notion of the panel's filters. The
   * dashboard inside the inbox measures whatever that panel is showing.
   * @returns {import('./index.d.ts').CommentMetrics}
   */
  getMetrics() {
    return computeMetrics(this.serializeComments());
  }

  /**
   * Downloads the corpus as CSV, one row per comment. Screenshots stay out:
   * a 33 KB base64 string in a spreadsheet cell is not data.
   * @param {import('./index.d.ts').SerializedComment[]} [comments] defaults to all
   */
  exportCommentsCsv(comments) {
    const rows = commentRows(comments || this.serializeComments());
    const csv = toCsv(rows, columnsOf(COMMENT_COLUMNS));
    downloadCsv("helldots-comments.csv", csv);
    // Returned as well as downloaded: a browser download is a dead end for a
    // host that wanted to POST the same rows to its own endpoint or attach
    // them to a message, and building the CSV twice is the only alternative.
    return csv;
  }

  /**
   * Downloads the aggregate figures as CSV in long format — one row per
   * bucket, so the shape stays the same however many days the corpus spans.
   * @param {import('./index.d.ts').SerializedComment[]} [comments] defaults to all
   */
  exportMetricsCsv(comments) {
    const metrics = computeMetrics(comments || this.serializeComments());
    const csv = toCsv(metricRows(metrics), columnsOf(METRIC_COLUMNS));
    downloadCsv("helldots-metrics.csv", csv);
    return csv;
  }

  /**
   * Opens the browser's print dialog on a report of the figures — which is
   * where "save as PDF" lives, at no cost in bundle size. The report is
   * built in its own document, so what prints is the report and not the
   * host page.
   * @param {import('./index.d.ts').SerializedComment[]} [comments] defaults to all
   * @param {string} [scope] a label describing what was measured
   */
  printMetricsReport(comments, scope) {
    const metrics = computeMetrics(comments || this.serializeComments());
    printMetricsReport(metrics, {
      strings: this.strings,
      locale: this.locale,
      css: getReportStyles(),
      scope,
    });
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
    this.markers?.remove(id);
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
    this.markers?.clear();
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

    // Called before the widget mounted — a host whose fetch resolved while
    // the document was still parsing. Resolving anchors against a half-built
    // DOM would report orphans that are not orphans and fire onAnchorLost
    // for each of them, so the data is held and replayed by initOverlay.
    // Zeroes are all this can honestly return at that point: nothing has
    // been resolved yet. A host that needs the counts should load from
    // onReady, where the widget is up and they mean something.
    if (!this.markers) {
      this._deferredLoad = [...(this._deferredLoad || []), ...data];
      return { anchored, orphaned, inactive };
    }

    for (const item of data) {
      if (!item || item.id == null || typeof item.text !== "string") {
        console.warn("HellDots: skipping malformed serialized comment", item);
        // A record the widget drops is a record the host still believes it
        // is showing — which is exactly the kind of divergence that goes
        // unnoticed until someone asks where their comment went.
        this._reportError(
          new Error("HellDots: skipping malformed serialized comment"),
          "load"
        );
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
              .map((reply) => ({
                ...reply,
                authorId: normalizeActorId(reply.authorId) || null,
                ...(Array.isArray(reply.screenshots)
                  ? { screenshots: onlyStrings(reply.screenshots) }
                  : {}),
                reactions: normalizeReactions(reply.reactions),
              }))
          : [],
        author: item.author || this.strings.anonymous,
        // Scrubbed like every other field crossing this boundary: the id
        // reaches a host that may look it up, so a non-string must not
        // survive a round trip through localStorage or a backend.
        authorId: normalizeActorId(item.authorId) || null,
        // Scrubbed on the way in like the reaction map: an unknown event type
        // has no label, and an unparseable timestamp poisons every duration
        // derived from it.
        history: normalizeHistory(item.history),
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
        // Reactions come from localStorage or from the host's backend, so the
        // map is scrubbed before any renderer sees it: unknown glyphs and
        // duplicated actor keys both survive a round trip otherwise.
        reactions: normalizeReactions(item.reactions),
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

    // Nothing is mounted and nothing is loaded yet (loadComments defers too),
    // so there is no state to re-sync — and every panel this touches below
    // is still null.
    if (!this.markers) return { anchored, orphaned, inactive };

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
    // An instance torn down before it mounted must not hold on to data it
    // will never replay.
    this._deferredLoad = null;
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
