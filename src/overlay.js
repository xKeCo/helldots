import {
  renderPage,
  cropRegion,
  cropViewport,
  withHiddenOverlay,
  AUTO_SCALE,
} from "./capture.js";
import { captureContext } from "./metadata.js";
import {
  CLASSES,
  IDS,
  SELECTORS,
  STATUSES,
  COMMENT_TYPES,
  PRIORITIES,
} from "./constants.js";
import { getStyles, getGlobalStyles } from "./styles.js";
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
  PENDING_DETAIL_KEY,
} from "./storage.js";
import { createId } from "./id.js";
import {
  createToolbar,
  createCommentBox,
  createCommentCircle,
  createTooltip,
  createThreadPopover,
  createReplyElement,
} from "./components.js";
import { InboxView } from "./inbox.js";
import { createContextBlock } from "./context-block.js";
import { createCommentActions, copyToClipboard } from "./comment-actions.js";
import { buildAgentContext } from "./agent-context.js";
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

class CommentOverlay {
  /**
   * @param {import('./index.d.ts').CommentOverlayOptions} [options]
   */
  constructor(options = {}) {
    this.comments = [];
    this.commentMode = false;
    this.isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    this.options = {
      shortcutKey: options.shortcutKey || (this.isMac ? "c" : "C"),
      shortcutModifier: options.shortcutModifier || "alt",
      autoScreenshot: options.autoScreenshot !== false,
      ...options,
    };
    this.locale = this.options.locale || detectLocale();
    this.strings = getStrings(this.locale);

    // Initialize resize observers and position validation
    this.resizeObservers = new Map();
    // Track mutation observers per comment
    this.mutationObservers = new Map();
    this.positionValidationEnabled = true;

    // rAF scheduling flag for bulk updates
    this._pendingRaf = null;
    this._pendingContextScreenshot = null;

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.initOverlay());
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

    // Bind event listeners
    this.bindEventListeners();
    this.setupKeyboardShortcut();
    this.setupResizeHandlers();
    this.injectStyles();

    if (this.options.persistence === "localStorage") {
      this.loadComments(readStoredComments());
      this._openPendingDetail();
    }
  }

  _navigateTo(url) {
    location.assign(url);
  }

  // Cross-page handoff: an inactive card click on the previous page left a
  // comment id in sessionStorage; open the inbox on its detail here.
  _openPendingDetail() {
    let id = null;
    try {
      id = sessionStorage.getItem(PENDING_DETAIL_KEY);
      if (id != null) sessionStorage.removeItem(PENDING_DETAIL_KEY);
    } catch {
      return;
    }
    if (!id) return;
    const comment = this.comments.find((c) => String(c.id) === id);
    if (!comment) return;
    this.showInbox();
    this.inboxView.openDetail(comment.id);
  }

  _syncStorage() {
    if (this.options.persistence !== "localStorage") return;
    writeStoredComments(
      mergeForStorage(
        readStoredComments(),
        this.serializeComments(),
        location.pathname
      )
    );
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

    this.attachImageInput.addEventListener("change", (e) => {
      const file = /** @type {HTMLInputElement} */ (e.target).files[0];
      if (!file) return;
      if (!this._pendingScreenshots) this._pendingScreenshots = [];
      if (this._pendingScreenshots.length >= 5) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        this._pendingScreenshots.push(ev.target.result);
        this._updateScreenshotsPreview();
      };
      reader.readAsDataURL(file);
      this.attachImageInput.value = "";
    });

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
          this.closeThreadPopover();
        } else if (this.inboxView?.isOpen()) {
          this.closeInbox();
        } else if (this.commentBox.style.display !== "none") {
          this.hideCommentBox();
          this.toggleCommentMode();
        } else if (this.commentMode) {
          this.toggleCommentMode();
        }
        return;
      }

      const isMacOptionC =
        this.isMac && e.altKey && (e.key === "ç" || e.key === "Ç");
      const isWindowsAltC =
        !this.isMac && e.altKey && e.key.toLowerCase() === "c";
      const isCustomShortcut =
        e.key.toLowerCase() === this.options.shortcutKey.toLowerCase() &&
        ((this.options.shortcutModifier === "alt" && e.altKey) ||
          (this.options.shortcutModifier === "ctrl" &&
            (e.ctrlKey || e.metaKey)) ||
          (this.options.shortcutModifier === "shift" && e.shiftKey));

      if (isMacOptionC || isWindowsAltC || isCustomShortcut) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleCommentMode();
        return false;
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

    this._dragStart = { x: e.clientX, y: e.clientY };
    this._isDragging = false;

    this._boundDragMove = (ev) => this._onDragMove(ev);
    this._boundDragEnd = (ev) => this._onDragEnd(ev);
    document.addEventListener("mousemove", this._boundDragMove);
    document.addEventListener("mouseup", this._boundDragEnd);
  }

  _onDragMove(e) {
    const dx = e.clientX - this._dragStart.x;
    const dy = e.clientY - this._dragStart.y;

    if (!this._isDragging && Math.hypot(dx, dy) < 5) return;

    this._isDragging = true;

    const left = Math.min(this._dragStart.x, e.clientX);
    const top = Math.min(this._dragStart.y, e.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);

    if (!this._selectionRect) {
      this._selectionRect = document.createElement("div");
      this._selectionRect.className = CLASSES.SELECTION_RECT;
      this.shadowRoot.appendChild(this._selectionRect);
    }

    this._selectionRect.style.left = `${left}px`;
    this._selectionRect.style.top = `${top}px`;
    this._selectionRect.style.width = `${width}px`;
    this._selectionRect.style.height = `${height}px`;
  }

  async _onDragEnd(e) {
    document.removeEventListener("mousemove", this._boundDragMove);
    document.removeEventListener("mouseup", this._boundDragEnd);

    if (this._isDragging) {
      const left = Math.min(this._dragStart.x, e.clientX);
      const top = Math.min(this._dragStart.y, e.clientY);
      const width = Math.abs(e.clientX - this._dragStart.x);
      const height = Math.abs(e.clientY - this._dragStart.y);

      this._selectionRect?.remove();
      this._selectionRect = null;

      if (width > 10 && height > 10) {
        try {
          if (!this._pendingScreenshots) this._pendingScreenshots = [];
          // One render feeds both images: the PNG region the user selected
          // and the automatic JPEG context shot.
          const full = await withHiddenOverlay(() => renderPage({ scale: 1 }));
          const dataUrl = cropRegion(full, { left, top, width, height });
          if (dataUrl && this._pendingScreenshots.length < 5) {
            this._pendingScreenshots.push(dataUrl);
          }
          if (this.options.autoScreenshot) {
            this._pendingContextScreenshot = cropViewport(full, {
              sourceScale: 1,
            });
          }
        } catch (err) {
          console.warn("Screenshot capture failed:", err);
        }
      }

      await this._placeCommentAtPoint(e.clientX, e.clientY);
    } else {
      await this._placeCommentAtPoint(this._dragStart.x, this._dragStart.y);
    }

    this._isDragging = false;
    this._dragStart = null;
  }

  async _placeCommentAtPoint(clientX, clientY) {
    // The no-drag path has no render yet. Half scale because the output is
    // half scale anyway — the render is the expensive part, and it costs
    // ~4x less here than at scale 1.
    if (this.options.autoScreenshot && !this._pendingContextScreenshot) {
      try {
        const full = await withHiddenOverlay(() =>
          renderPage({ scale: AUTO_SCALE })
        );
        this._pendingContextScreenshot = cropViewport(full, {
          sourceScale: AUTO_SCALE,
        });
      } catch (err) {
        console.warn("HellDots: automatic screenshot failed", err);
        this._pendingContextScreenshot = null;
      }
    }

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
    container.innerHTML = "";

    if (!this._pendingScreenshots || this._pendingScreenshots.length === 0) {
      container.classList.remove(CLASSES.ACTIVE);
      return;
    }

    container.classList.add(CLASSES.ACTIVE);

    this._pendingScreenshots.forEach((dataUrl, i) => {
      const item = document.createElement("div");
      item.className = CLASSES.SCREENSHOT_ITEM;

      const img = document.createElement("img");
      img.className = CLASSES.SCREENSHOT_IMG;
      img.src = dataUrl;
      img.alt = this.strings.attachedScreenshot;
      img.onclick = () => this.showLightbox(dataUrl);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = CLASSES.SCREENSHOT_REMOVE;
      removeBtn.setAttribute("aria-label", this.strings.removeScreenshot);
      removeBtn.innerHTML = "&times;";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        this._pendingScreenshots.splice(i, 1);
        this._updateScreenshotsPreview();
      };

      item.appendChild(img);
      item.appendChild(removeBtn);
      container.appendChild(item);
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

    const circleBaseSize = 28;
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
    this._pendingContextScreenshot = null;
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

  saveComment() {
    if (!this.commentInput.value.trim() || !this.currentPosition) return;

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
      contextScreenshot: this._pendingContextScreenshot,
    };

    this.comments.push(comment);
    this._syncStorage();
    this.options.onCommentCreated?.(this._serializeComment(comment));
    this.renderCommentCircle(comment);
    this.hideCommentBox();
    this.toggleCommentMode();

    const circle = this.shadowRoot.querySelector(
      `[data-comment-id="${comment.id}"]`
    );
    if (circle) {
      this.showThreadPopover(circle, comment);
    }
  }

  renderCommentCircle(comment) {
    const circle = createCommentCircle(comment, this.strings);

    circle.addEventListener("mouseenter", () =>
      this.showCommentTooltip(circle, comment)
    );
    circle.addEventListener("mouseleave", () => {
      setTimeout(() => {
        const tooltip = this.shadowRoot.querySelector(
          `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
        );
        if (tooltip && !tooltip.matches(":hover")) {
          tooltip.remove();
        }
      }, 250);
    });

    circle.addEventListener("click", (e) => {
      e.stopPropagation();
      const tooltip = this.shadowRoot.querySelector(
        `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
      );
      if (tooltip) tooltip.remove();
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

    this.overlay.appendChild(circle);
    this.updateCommentPosition(comment, circle);

    this.createResizeObserver(comment, circle);
    this.createMutationObserver(comment);
  }

  showCommentTooltip(circle, comment) {
    const existingPopover = this.shadowRoot.querySelector(
      `.${CLASSES.THREAD_POPOVER}[data-for="${comment.id}"]`
    );
    if (existingPopover) return;

    const existingTooltip = this.shadowRoot.querySelector(
      `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
    );
    if (existingTooltip) return;

    const tooltip = createTooltip(comment, this.strings, this.locale);
    this.shadowRoot.appendChild(tooltip);

    tooltip
      .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
      .forEach((/** @type {HTMLImageElement} */ img) => {
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          this.showLightbox(img.src);
        });
      });

    setTimeout(() => {
      this.positionPopoverAtCircle(tooltip, circle);
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

  // `circle` may be null for orphaned comments (opened from the inbox):
  // the popover is centered in the viewport instead of pinned to a marker.
  showThreadPopover(circle, comment) {
    this.closeThreadPopover();

    const existingTooltip = this.shadowRoot.querySelector(
      `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
    );
    if (existingTooltip) existingTooltip.remove();

    // Keeps the selected marker visibly picked out while its thread is open
    // — same growth as hover, plus a ring, so it survives the pointer
    // leaving the circle to reach the popover.
    circle?.classList.add(CLASSES.CIRCLE_ACTIVE);
    // Remembered so scrolling can keep the popover pinned to it. Null for
    // orphaned comments opened from the inbox — those get centered instead
    // and have no marker to follow.
    this._activePopoverCircle = circle || null;

    const onDeleteReply = (reply, replyEl) => {
      if (!this.deleteReply(comment.id, reply.id)) return;
      replyEl.remove();
      if (this.inboxView?.isOpen()) this.inboxView.refresh();
    };

    const popover = createThreadPopover(comment, this.strings, this.locale, {
      onDeleteReply,
    });
    this.shadowRoot.appendChild(popover);

    // Same action strip as the inbox cards: copy agent context, lifecycle
    // status picker (RF09) and the ⋯ menu.
    const headerEl = popover.querySelector(`.${CLASSES.THREAD_HEADER}`);
    const actionsEl = createCommentActions(comment, {
      strings: this.strings,
      onCopy: (c) =>
        copyToClipboard(
          buildAgentContext(c, {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            strings: this.strings,
          })
        ),
      onSetStatus: (c, status) => this.setCommentStatus(c.id, status),
      onSetType: (c, type) => this.setCommentType(c.id, type),
      onSetPriority: (c, priority) => this.setCommentPriority(c.id, priority),
      onDelete: (c) => {
        this.closeThreadPopover();
        this.deleteComment(c.id);
        if (this.inboxView?.isOpen()) this.inboxView.refresh();
      },
    });
    // Its own row under the header, for the same reason the inbox card has
    // a footer: five controls sharing the header left the author ~90px and
    // truncated it mid-name.
    const actionsRow = document.createElement("div");
    actionsRow.className = CLASSES.THREAD_ACTIONS_ROW;
    actionsRow.appendChild(actionsEl);
    headerEl.insertAdjacentElement("afterend", actionsRow);

    // The root comment's gallery, not the reply box's pending previews.
    const mainScreenshotsContainer = popover.querySelector(
      `.${CLASSES.THREAD_SCROLL} > .${CLASSES.SCREENSHOTS_CONTAINER}`
    );
    if (mainScreenshotsContainer) {
      mainScreenshotsContainer
        .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
        .forEach((/** @type {HTMLImageElement} */ img) => {
          img.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showLightbox(img.src);
          });
        });
    }

    // RF2 — the automatic capture used to be reachable only from the inbox
    // detail. Collapsed by default so the popover stays a conversation
    // first; built here because it needs the lightbox callback.
    const contextBlock = createContextBlock(comment, {
      strings: this.strings,
      onShowLightbox: (src) => this.showLightbox(src),
      collapsible: true,
    });
    if (contextBlock) {
      // `.before()` rather than popover.insertBefore(): the replies live
      // inside the scroll container, not directly under the popover.
      popover.querySelector(`.${CLASSES.THREAD_REPLIES}`).before(contextBlock);
    }

    setTimeout(() => {
      if (circle) {
        this.positionPopoverAtCircle(popover, circle);
      } else {
        this.centerPopover(popover);
      }
    }, 10);

    popover
      .querySelector(`.${CLASSES.CLOSE_TOOLTIP}`)
      .addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeThreadPopover();
      });

    /** @type {HTMLInputElement} */
    const input = /** @type {any} */ (
      popover.querySelector(`.${CLASSES.THREAD_INPUT}`)
    );
    const submitBtn = popover.querySelector(`.${CLASSES.THREAD_SUBMIT}`);
    const threadAttachBtn = popover.querySelector(
      `.${CLASSES.THREAD_INPUT_AREA} .${CLASSES.ATTACH_IMAGE_BTN}`
    );
    /** @type {HTMLInputElement} */
    const threadFileInput = /** @type {any} */ (
      popover.querySelector(`.${CLASSES.THREAD_INPUT_AREA} input[type="file"]`)
    );
    const threadScreenshotsContainer = popover.querySelector(
      `.${CLASSES.THREAD_INPUT_AREA} .${CLASSES.SCREENSHOTS_CONTAINER}`
    );

    let pendingReplyScreenshots = [];

    const updateReplyScreenshotsPreview = () => {
      threadScreenshotsContainer.innerHTML = "";
      if (pendingReplyScreenshots.length === 0) {
        threadScreenshotsContainer.classList.remove(CLASSES.ACTIVE);
        return;
      }
      threadScreenshotsContainer.classList.add(CLASSES.ACTIVE);
      pendingReplyScreenshots.forEach((dataUrl, i) => {
        const item = document.createElement("div");
        item.className = CLASSES.SCREENSHOT_ITEM;

        const img = document.createElement("img");
        img.className = CLASSES.SCREENSHOT_IMG;
        img.src = dataUrl;
        img.alt = this.strings.attachedScreenshot;
        img.onclick = () => this.showLightbox(dataUrl);

        const removeBtn = document.createElement("button");
        removeBtn.className = CLASSES.SCREENSHOT_REMOVE;
        removeBtn.innerHTML = "&times;";
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          pendingReplyScreenshots.splice(i, 1);
          updateReplyScreenshotsPreview();
        };

        item.appendChild(img);
        item.appendChild(removeBtn);
        threadScreenshotsContainer.appendChild(item);
      });
    };

    threadAttachBtn.addEventListener("click", () => {
      threadFileInput.click();
    });

    threadFileInput.addEventListener("change", (e) => {
      const file = /** @type {HTMLInputElement} */ (e.target).files[0];
      if (!file) return;
      if (pendingReplyScreenshots.length >= 5) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingReplyScreenshots.push(ev.target.result);
        updateReplyScreenshotsPreview();
      };
      reader.readAsDataURL(file);
      threadFileInput.value = "";
    });

    const submitReply = () => {
      const text = input.value.trim();
      if (!text && pendingReplyScreenshots.length === 0) return;

      const reply = this.addReply(
        comment,
        text,
        pendingReplyScreenshots.length > 0 ? [...pendingReplyScreenshots] : []
      );

      const repliesContainer = popover.querySelector(
        `.${CLASSES.THREAD_REPLIES}`
      );
      const replyEl = createReplyElement(reply, this.strings, this.locale, {
        onDelete: onDeleteReply,
      });
      repliesContainer.appendChild(replyEl);

      replyEl
        .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
        .forEach((/** @type {HTMLImageElement} */ img) => {
          img.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showLightbox(img.src);
          });
        });

      // Once the thread is taller than the popover the new reply lands below
      // the fold, so sending would look like nothing happened.
      const scrollEl = popover.querySelector(`.${CLASSES.THREAD_SCROLL}`);
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;

      input.value = "";
      pendingReplyScreenshots = [];
      updateReplyScreenshotsPreview();
      input.focus();
    };

    submitBtn.addEventListener("click", submitReply);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitReply();
      }
    });

    this.activeThreadPopover = popover;

    // Sending a reply, expanding the context block or a screenshot finishing
    // its decode all change the popover's height after it was placed. Without
    // re-running the anchor decision the box keeps the top it was given and
    // grows straight off the bottom of the viewport. Watching the element is
    // the one hook that covers every cause; guarded because jsdom has no
    // ResizeObserver.
    if (typeof ResizeObserver !== "undefined") {
      this._popoverResizeObserver = new ResizeObserver(() =>
        this._repositionThreadPopover()
      );
      this._popoverResizeObserver.observe(popover);
    }

    setTimeout(() => input.focus(), 50);

    setTimeout(() => {
      this._threadClickHandler = (e) => {
        const target = e.composedPath()[0] || e.target;
        if (
          !popover.contains(target) &&
          !circle?.contains(target) &&
          !this._isInsideLightbox(target)
        ) {
          this.closeThreadPopover();
        }
      };
      document.addEventListener("mousedown", this._threadClickHandler);
    }, 0);
  }

  closeThreadPopover() {
    // Queried rather than remembered: the marker can be re-rendered while
    // its popover is open, and the stale reference would keep the class.
    // cleanup() reaches here before initOverlay() has run when the document
    // was still loading, so there may be no shadow root yet.
    this.shadowRoot
      ?.querySelectorAll(`.${CLASSES.CIRCLE_ACTIVE}`)
      .forEach((/** @type {HTMLElement} */ el) =>
        el.classList.remove(CLASSES.CIRCLE_ACTIVE)
      );
    this._popoverResizeObserver?.disconnect();
    this._popoverResizeObserver = null;
    if (this.activeThreadPopover) {
      this.activeThreadPopover.remove();
      this.activeThreadPopover = null;
    }
    this._activePopoverCircle = null;
    if (this._threadClickHandler) {
      document.removeEventListener("mousedown", this._threadClickHandler);
      this._threadClickHandler = null;
    }
  }

  showLightbox(imageSrc) {
    this.closeLightbox();

    const lightbox = document.createElement("div");
    lightbox.className = CLASSES.LIGHTBOX;

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
  }

  closeLightbox() {
    this._activeLightbox?.remove();
    this._activeLightbox = null;
  }

  // The lightbox is opened *from* the inbox and the thread popover but lives
  // as their sibling in the shadow root, so a naive "is this click outside my
  // element?" test reads every click on it — including its own close button —
  // as a click away from the panel, and tears the panel down behind it.
  _isInsideLightbox(target) {
    return Boolean(target?.closest?.(`.${CLASSES.LIGHTBOX}`));
  }

  addReply(comment, text, screenshots = []) {
    if (!comment.replies) comment.replies = [];
    const reply = {
      id: createId(),
      text,
      author: this.options.user?.name || this.strings.anonymous,
      timestamp: new Date().toISOString(),
      screenshots,
    };
    comment.replies.push(reply);
    this._syncStorage();
    this.options.onReplyAdded?.(
      this._serializeComment(comment),
      this._serializeReply(reply)
    );
    return reply;
  }

  /**
   * Removes one reply from a thread. The root comment is untouched — deleting
   * the last reply leaves the comment itself standing, which is why this is
   * separate from deleteComment rather than a special case of it.
   *
   * @param {number} commentId
   * @param {number} replyId
   * @returns {boolean} false when either id does not resolve
   */
  deleteReply(commentId, replyId) {
    const comment = this.comments.find((c) => c.id === commentId);
    const index = comment?.replies?.findIndex((r) => r.id === replyId) ?? -1;
    if (index < 0) return false;

    const [reply] = comment.replies.splice(index, 1);
    this._syncStorage();
    this.options.onReplyDeleted?.(
      this._serializeComment(comment),
      this._serializeReply(reply)
    );
    return true;
  }

  _serializeReply({ id, text, author, timestamp, screenshots }) {
    return { id, text, author, timestamp, screenshots: screenshots || [] };
  }

  /**
   * Serializable snapshot of one comment: the live `container` element is
   * replaced by its `anchor`. Screenshots (data-URLs) are included — the
   * localStorage mode and the inbox cards need them.
   */
  _serializeComment(comment) {
    return {
      id: comment.id,
      text: comment.text,
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
   * @param {number} id
   * @param {import('./index.d.ts').CommentStatus} status
   * @returns {boolean} false when the id or status is unknown
   */
  setCommentStatus(id, status) {
    if (!STATUSES.includes(status)) return false;
    const comment = this.comments.find((c) => c.id === id);
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
    // Resolving removes the on-page marker; reopening restores it.
    const circle = /** @type {HTMLElement} */ (
      this.shadowRoot?.querySelector(`[data-comment-id="${id}"]`)
    );
    if (circle) this.updateCommentPosition(comment, circle);
    this._syncStorage();
    // Re-render the inbox so the card picks up the new status right away
    // (resolved styling + sink-to-bottom sorting) no matter where the
    // change came from — card, detail or thread popover.
    if (this.inboxView?.isOpen()) this.inboxView.refresh();
    this.options.onCommentStatusChanged?.(this._serializeComment(comment));
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
    this.options.onCommentUpdated?.(this._serializeComment(comment));
    return true;
  }

  /**
   * RF3 — categorises a comment. `null` returns it to the neutral state.
   * @param {number} id
   * @param {import('./index.d.ts').CommentType | null} type
   * @returns {boolean} false when the id or type is unknown
   */
  setCommentType(id, type) {
    if (type !== null && !COMMENT_TYPES.includes(type)) return false;
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return false;
    comment.type = type;
    return this._commitUpdate(comment);
  }

  /**
   * RF4 — prioritises a comment. `null` returns it to the neutral state.
   * @param {number} id
   * @param {import('./index.d.ts').CommentPriority | null} priority
   * @returns {boolean} false when the id or priority is unknown
   */
  setCommentPriority(id, priority) {
    if (priority !== null && !PRIORITIES.includes(priority)) return false;
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return false;
    comment.priority = priority;
    return this._commitUpdate(comment);
  }

  /**
   * RF3 — replaces a comment's free-form labels. Values are trimmed,
   * lowercased and de-duplicated.
   * @param {number} id
   * @param {string[]} tags
   * @returns {boolean} false when the id is unknown or tags isn't an array
   */
  setCommentTags(id, tags) {
    if (!Array.isArray(tags)) return false;
    const comment = this.comments.find((c) => c.id === id);
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
   * @param {number} id
   * @returns {boolean} false when the id is unknown
   */
  deleteComment(id) {
    if (!this.comments.some((comment) => comment.id === id)) return false;
    this._removeComment(id);
    if (this.options.persistence === "localStorage") {
      // The merge preserves other-page entries missing from memory, which
      // would resurrect a deleted inactive comment — drop the id explicitly.
      writeStoredComments(
        mergeForStorage(
          readStoredComments().filter((comment) => comment.id !== id),
          this.serializeComments(),
          location.pathname
        )
      );
    }
    this.options.onCommentDeleted?.(id);
    return true;
  }

  _removeComment(id) {
    this.cleanupResizeObserver(id);
    if (this.mutationObservers.has(id)) {
      try {
        this.mutationObservers.get(id).disconnect();
      } catch {}
      this.mutationObservers.delete(id);
    }
    this.shadowRoot.querySelector(`[data-comment-id="${id}"]`)?.remove();
    this.comments = this.comments.filter((comment) => comment.id !== id);
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
        anchor: item.anchor || null,
        anchorState: "orphaned",
        target: null,
        hidden: false,
        page: item.page || location.pathname,
        container: null,
        relativeX: 0,
        relativeY: 0,
        replies: Array.isArray(item.replies) ? [...item.replies] : [],
        author: item.author || this.strings.anonymous,
        createdAt: item.createdAt || new Date().toISOString(),
        screenshots: Array.isArray(item.screenshots)
          ? [...item.screenshots]
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
        this.options.onAnchorLost?.(this._serializeComment(comment));
      }
    }

    return { anchored, orphaned, inactive };
  }

  centerPopover(el) {
    const elRect = el.getBoundingClientRect();
    const x = Math.max(10, (window.innerWidth - (elRect.width || 400)) / 2);
    const y = Math.max(10, (window.innerHeight - elRect.height) / 2);
    el.style.left = `${x}px`;
    // Explicitly cleared: this element may have been bottom-anchored by
    // positionPopoverAtCircle, and `top` alone would not win over it.
    el.style.bottom = "auto";
    el.style.top = `${y}px`;
  }

  /**
   * Brings a comment's marker into view, centred vertically.
   *
   * Deliberately not `comment.container.scrollIntoView()`: the container is
   * the coarse anchor box (`section, div[class*=container|content]`), which
   * falls back to `<body>` whenever the commented element has no such
   * ancestor. Centring `<body>` lands halfway down the document — nowhere
   * near the marker, which is what made opening a comment from the inbox
   * jump to an unrelated section.
   *
   * @param {any} comment
   */
  scrollMarkerIntoView(comment) {
    const y = this._markerViewportY(comment);
    if (y == null) return;
    window.scrollTo({
      top: Math.max(0, window.scrollY + y - window.innerHeight / 2),
    });
  }

  /**
   * The marker's centre in viewport coordinates, derived from the anchor the
   * same way `updateCommentPosition` derives it — including the clamp that
   * keeps the circle inside its container.
   *
   * Deliberately not read off the rendered circle: the circle's coordinates
   * are only refreshed inside a rAF on scroll, so they are stale for any
   * caller that runs in the same tick as a scroll. The container's rect is
   * live, which makes this correct whenever it is asked.
   *
   * @param {any} comment
   * @returns {number | null} null when there is no anchor to resolve
   */
  _markerViewportY(comment) {
    const container = comment.container;
    if (!container?.isConnected) return null;
    const rect = container.getBoundingClientRect();
    if (rect.height <= 0) return null;

    const circleSize = 28;
    const offsetY = Math.max(
      0,
      Math.min(comment.relativeY * rect.height, rect.height - circleSize)
    );
    return rect.top + offsetY + circleSize / 2;
  }

  /**
   * Keeps the open thread popover pinned beside its marker while the page
   * scrolls, and hides it while the marker is off-screen.
   *
   * Hidden, not closed: a half-typed reply must survive scrolling the marker
   * out of view and back. Closing here would also fight the outside-click
   * handler, which is the thing that legitimately dismisses the popover.
   */
  /**
   * Re-runs the open popover's placement against its current size. Split from
   * syncThreadPopoverToMarker because that one also decides visibility from
   * the marker, which is wrong here: a popover resizing while its marker is
   * off-screen must stay hidden, not reappear.
   */
  _repositionThreadPopover() {
    const popover = this.activeThreadPopover;
    if (!popover || popover.style.display === "none") return;

    if (this._activePopoverCircle) {
      this.positionPopoverAtCircle(popover, this._activePopoverCircle);
    } else {
      this.centerPopover(popover);
    }
  }

  syncThreadPopoverToMarker() {
    const popover = this.activeThreadPopover;
    const circle = this._activePopoverCircle;
    // A popover with no marker is the centered variant (orphaned comment
    // opened from the inbox); it has nothing to track.
    if (!popover || !circle) return;

    const rect = circle.getBoundingClientRect();
    const onScreen =
      circle.isConnected &&
      circle.style.display !== "none" &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth;

    if (!onScreen) {
      popover.style.display = "none";
      return;
    }

    // Un-hide before measuring: a `display: none` element reports a zero
    // rect, and positionPopoverAtCircle sizes itself from that measurement.
    popover.style.display = "";
    this.positionPopoverAtCircle(popover, circle);
  }

  positionPopoverAtCircle(el, circle) {
    const circleRect = circle.getBoundingClientRect();
    const centerX = circleRect.left + circleRect.width / 2;
    const centerY = circleRect.top + circleRect.height / 2;
    const circleBaseSize = 28;
    const offset = circleBaseSize / 2 + 10;

    // Same reasoning as showCommentBox(): the tooltip and popover are
    // `min(400px, 100vw - 24px)` wide, so their real width has to be read.
    const elRect = el.getBoundingClientRect();
    const elWidth = elRect.width || 400;

    let x = centerX + offset;

    if (x + elWidth > window.innerWidth) {
      x = centerX - offset - elWidth;
    }
    x = Math.min(x, window.innerWidth - elWidth - 10);
    x = Math.max(10, x);
    el.style.left = `${x}px`;

    // Vertically the popover is anchored by whichever edge keeps it on
    // screen, and that choice is what makes it grow in the right direction.
    //
    // Pinning `top` alone was not enough: `max-height` caps the height but
    // says nothing about where the box starts, so a marker low on the page
    // put the top at, say, 600px and the popover simply ran off the bottom —
    // taking the reply input with it, so you could not see what you were
    // typing. Re-clamping `top` on every growth would fight the user, since
    // each new reply would shift the whole thread upward under the cursor.
    //
    // Anchoring `bottom` instead makes the browser do it: the reply box stays
    // put and the thread extends upward until `max-height` takes over and
    // `.thread-scroll` starts scrolling.
    const margin = 10;
    const preferredTop = centerY - circleBaseSize / 2;
    const spaceBelow = window.innerHeight - margin - preferredTop;

    if (elRect.height > spaceBelow) {
      el.style.top = "auto";
      el.style.bottom = `${margin}px`;
    } else {
      el.style.bottom = "auto";
      el.style.top = `${Math.max(margin, preferredTop)}px`;
    }
  }

  createPreviewCircle(x, y) {
    this.removePreviewCircle();

    const circle = document.createElement("div");
    circle.className = `${CLASSES.CIRCLE} ${CLASSES.PREVIEW_CIRCLE}`;
    circle.style.position = "absolute";
    const circleRadius = 14;
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

  cleanupResizeObserver(commentId) {
    if (this.resizeObservers && this.resizeObservers.has(commentId)) {
      const { circle, observer } = this.resizeObservers.get(commentId);
      if (observer) {
        observer.disconnect();
      }
      if (circle && circle.parentNode) {
        circle.parentNode.removeChild(circle);
      }
      this.resizeObservers.delete(commentId);
    }
  }

  /**
   * Validates and recalculates comment position based on container dimensions
   * @param {Object} comment - The comment object with position data
   * @param {HTMLElement} circle - The comment circle element
   * @returns {Object} - Validated position data
   */
  validateAndCalculatePosition(comment, circle) {
    if (!comment.container || !circle) return null;

    const containerRect = comment.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;

    // Zero size isn't an anomaly: it's what display:none (e.g. responsive
    // media queries) looks like. The caller hides the marker until the
    // element gets its size back.
    if (containerWidth <= 0 || containerHeight <= 0) {
      return null;
    }

    // Use simple relative positioning for consistent results
    const absoluteX = comment.relativeX * containerWidth;
    const absoluteY = comment.relativeY * containerHeight;

    const circleSize = 28;
    const validatedX = Math.max(
      0,
      Math.min(absoluteX, containerWidth - circleSize)
    );
    const validatedY = Math.max(
      0,
      Math.min(absoluteY, containerHeight - circleSize)
    );

    // Recalculate relative position for future calculations
    const validatedRelativeX = validatedX / containerWidth;
    const validatedRelativeY = validatedY / containerHeight;

    return {
      absoluteX: validatedX,
      absoluteY: validatedY,
      relativeX: validatedRelativeX,
      relativeY: validatedRelativeY,
      containerWidth,
      containerHeight,
      containerLeft: containerRect.left,
      containerTop: containerRect.top,
    };
  }

  /**
   * Updates comment circle position based on validated calculations
   * @param {Object} comment - The comment object
   * @param {HTMLElement} circle - The comment circle element
   */
  /**
   * The exact element the user clicked on can vanish (responsive
   * display:none) while its coarse anchor container stays visible. When we
   * have a live target — or can re-derive one from the serialized
   * targetSelector — the marker follows ITS visibility too.
   */
  _isAnchorTargetVisible(comment) {
    let target = comment.target;
    if ((!target || !target.isConnected) && comment.anchor?.targetSelector) {
      try {
        target = document.querySelector(comment.anchor.targetSelector);
      } catch {
        target = null;
      }
      comment.target = target || null;
    }
    if (!target || !target.isConnected) return true; // no signal — assume visible
    const rect = target.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * A marker floats above the whole page (own shadow host, high z-index),
   * so a host-page modal overlay can never cover it with CSS alone. Hit-test
   * the marker's point instead: if the topmost page element there is
   * unrelated to the comment's anchor (neither ancestor nor descendant),
   * something like a modal backdrop is covering it and the marker should
   * hide with it.
   */
  _isMarkerOccluded(comment, x, y) {
    if (typeof document.elementsFromPoint !== "function") return false;
    // Off-viewport points can't be hit-tested; the marker isn't visible
    // there anyway, so keep the current (visible) state.
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
      return false;
    }
    const stack = document.elementsFromPoint(x, y);
    // Our own shadow host shows up first (the marker itself, toolbar, …).
    const top = stack.find(
      (el) => el.tagName.toLowerCase() !== TAG_NAME.toLowerCase()
    );
    if (!top) return false;

    const target = comment.target?.isConnected ? comment.target : null;
    // The precise element the comment was left on (or its subtree /
    // ancestors) is what should be under the marker — never an occluder.
    if (target && (target.contains(top) || top.contains(target))) {
      return false;
    }

    const container = comment.container;
    if (!container?.isConnected) return false;
    // Something entirely unrelated to the anchor sits on top of it.
    if (!container.contains(top) && !top.contains(container)) return true;

    // `top` lives inside the anchor container — usually normal content of
    // the anchored subtree. But broad containers (body, page wrappers) also
    // contain the page's modals, so walk the chain up to the container: if
    // it crosses a modal-looking layer the anchor doesn't belong to, the
    // marker is covered after all.
    if (container.contains(top) && top !== container) {
      for (let el = top; el && el !== container; el = el.parentElement) {
        if (this._looksLikeModalLayer(el, target)) return true;
      }
    }
    return false;
  }

  /**
   * Heuristic for "this element is a modal/backdrop layer": explicit dialog
   * semantics, or a hit-testable fixed element covering most of the
   * viewport. Elements that contain the comment's own target are the layer
   * the comment lives in, never an occluder.
   */
  _looksLikeModalLayer(el, target) {
    if (target && el.contains(target)) return false;
    if (el.matches?.('dialog, [aria-modal="true"], [role="dialog"]')) {
      return true;
    }
    if (getComputedStyle(el).position !== "fixed") return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.width >= window.innerWidth * 0.5 &&
      rect.height >= window.innerHeight * 0.5
    );
  }

  // A marker that just went away must not leave its hover tooltip or its
  // open thread popover floating on the page (e.g. above the modal that
  // now covers the marker).
  _dismissMarkerUi(comment) {
    this.shadowRoot
      .querySelector(`.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`)
      ?.remove();
    if (this.activeThreadPopover?.dataset.for === String(comment.id)) {
      this.closeThreadPopover();
    }
  }

  updateCommentPosition(comment, circle) {
    // Resolved comments have no on-page marker (RF09). This is not the
    // "hidden" state — the anchor is fine, the issue is just done.
    if (comment.status === "resolved") {
      if (circle) circle.style.display = "none";
      return;
    }

    let positionData = this.validateAndCalculatePosition(comment, circle);
    if (positionData && !this._isAnchorTargetVisible(comment)) {
      positionData = null;
    }
    const wasHidden = comment.hidden === true;

    if (!positionData) {
      // Anchor element currently invisible (zero-size container): hide the
      // marker; it comes back automatically when the observers fire again.
      if (circle && comment.container) {
        comment.hidden = true;
        circle.style.display = "none";
        this._dismissMarkerUi(comment);
        if (!wasHidden && this.inboxView?.isOpen()) this.inboxView.refresh();
      }
      return;
    }

    // Offset so the circle's top-left tip (sharp corner) aligns with the stored position
    const circleRadius = 14;
    const viewportX =
      positionData.containerLeft + positionData.absoluteX + circleRadius;
    const viewportY =
      positionData.containerTop + positionData.absoluteY + circleRadius;

    // A host-page modal (or any unrelated overlay) covering the anchor also
    // hides the marker — it must not float above the modal's backdrop.
    if (this._isMarkerOccluded(comment, viewportX, viewportY)) {
      comment.hidden = true;
      circle.style.display = "none";
      this._dismissMarkerUi(comment);
      if (!wasHidden && this.inboxView?.isOpen()) this.inboxView.refresh();
      return;
    }

    comment.hidden = false;
    circle.style.display = "";
    if (wasHidden && this.inboxView?.isOpen()) this.inboxView.refresh();

    circle.style.left = `${viewportX}px`;
    circle.style.top = `${viewportY}px`;
    circle.style.transform = "translate(-50%, -50%)";
    circle.style.position = "absolute";

    comment.relativeX = positionData.relativeX;
    comment.relativeY = positionData.relativeY;
  }

  /**
   * Sets up resize observers and window resize handlers
   */
  setupResizeHandlers() {
    // Throttled updater
    this.scheduleUpdatePositions = () => {
      if (this._pendingRaf) return;
      this._pendingRaf = requestAnimationFrame(() => {
        this._pendingRaf = null;
        if (this.positionValidationEnabled) {
          this.comments.forEach((comment) => {
            /** @type {HTMLElement} */
            const circle = /** @type {any} */ (
              this.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`)
            );
            if (circle) this.updateCommentPosition(comment, circle);
          });
        }
        // Runs even with position validation off: the markers are placed in
        // viewport coordinates either way, so the popover has to follow.
        this.syncThreadPopoverToMarker();
      });
    };

    // Window resize handler for viewport changes
    this.windowResizeHandler = () => {
      this.scheduleUpdatePositions();
    };
    window.addEventListener("resize", this.windowResizeHandler, {
      passive: true,
    });

    // Capture scroll on any scrolling ancestor
    this.scrollHandler = () => {
      this.scheduleUpdatePositions();
    };
    window.addEventListener("scroll", this.scrollHandler, {
      capture: true,
      passive: true,
    });

    // Update after resources load (images, fonts)
    this.loadHandler = () => {
      this.scheduleUpdatePositions();
    };
    window.addEventListener("load", this.loadHandler);

    // Modals open/close outside any comment's container (backdrops are
    // usually appended to <body> or toggled via style/class), so the
    // per-comment observers never see them. One page-wide observer keeps
    // the occlusion check honest; shadow-root internals don't bubble into
    // it, so our own marker updates can't retrigger it.
    if (window.MutationObserver) {
      this._globalMutationObserver = new MutationObserver(() => {
        this.scheduleUpdatePositions();
      });
      this._globalMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "hidden", "open"],
      });
    }
  }

  /**
   * Debug function to log position information
   * @param {Object} comment - The comment object
   * @param {HTMLElement} circle - The comment circle element
   */
  debugPosition(comment, circle) {
    if (!comment || !circle) return;

    const containerRect = comment.container.getBoundingClientRect();
    const circleRect = circle.getBoundingClientRect();

    // Calculate expected position from relative coordinates
    const expectedX = comment.relativeX * containerRect.width;
    const expectedY = comment.relativeY * containerRect.height;

    console.log("Position Debug:", {
      commentId: comment.id,
      relativePosition: { x: comment.relativeX, y: comment.relativeY },
      containerRect: {
        left: containerRect.left,
        top: containerRect.top,
        width: containerRect.width,
        height: containerRect.height,
      },
      circlePosition: {
        left: circleRect.left,
        top: circleRect.top,
        centerX: circleRect.left + circleRect.width / 2,
        centerY: circleRect.top + circleRect.height / 2,
      },
      expectedPosition: {
        x: expectedX,
        y: expectedY,
      },
      offset: {
        x:
          circleRect.left +
          circleRect.width / 2 -
          (containerRect.left + expectedX),
        y:
          circleRect.top +
          circleRect.height / 2 -
          (containerRect.top + expectedY),
      },
    });
  }

  /**
   * Creates a ResizeObserver for a specific comment container
   * @param {Object} comment - The comment object
   * @param {HTMLElement} circle - The comment circle element
   */
  createResizeObserver(comment, circle) {
    if (!window.ResizeObserver) {
      console.warn(
        "ResizeObserver not supported, position validation will be limited"
      );
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (!this.positionValidationEnabled) return;

      for (const entry of entries) {
        // Only update if the container size actually changed
        if (entry.target === comment.container) {
          this.updateCommentPosition(comment, circle);
        }
      }
    });

    // Start observing the container
    observer.observe(comment.container);

    // Store the observer for cleanup
    this.resizeObservers.set(comment.id, {
      circle,
      observer,
      container: comment.container,
    });
  }

  /**
   * Creates a MutationObserver to react to layout-affecting DOM changes
   * @param {Object} comment
   */
  createMutationObserver(comment) {
    if (!window.MutationObserver) return;

    // Disconnect existing for this comment if any
    if (this.mutationObservers.has(comment.id)) {
      try {
        this.mutationObservers.get(comment.id).disconnect();
      } catch {}
      this.mutationObservers.delete(comment.id);
    }

    const observer = new MutationObserver(() => {
      this.scheduleUpdatePositions();
    });

    observer.observe(comment.container, {
      attributes: true,
      attributeFilter: undefined,
      childList: true,
      subtree: true,
    });

    this.mutationObservers.set(comment.id, observer);
  }

  /**
   * Cleanup method to remove all event listeners and observers
   */
  cleanup() {
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
    this._selectionRect?.remove();
    this._pendingScreenshots = [];

    if (this._handleDocumentClickBound) {
      document.removeEventListener("mousedown", this._handleDocumentClickBound);
    }

    if (this.windowResizeHandler) {
      window.removeEventListener("resize", this.windowResizeHandler);
    }

    if (this.scrollHandler) {
      window.removeEventListener("scroll", this.scrollHandler, {
        capture: true,
      });
    }

    if (this.loadHandler) {
      window.removeEventListener("load", this.loadHandler);
    }

    if (this._globalMutationObserver) {
      this._globalMutationObserver.disconnect();
      this._globalMutationObserver = null;
    }

    // Cleanup all resize observers
    if (this.resizeObservers) {
      this.resizeObservers.forEach(({ observer }) => {
        if (observer) {
          observer.disconnect();
        }
      });
      this.resizeObservers.clear();
    }

    // Cleanup mutation observers
    if (this.mutationObservers) {
      this.mutationObservers.forEach((observer) => {
        try {
          observer.disconnect();
        } catch {}
      });
      this.mutationObservers.clear();
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
    document.getElementById(IDS.GLOBAL_STYLES)?.remove();

    // Remove all comment circles
    this.comments.forEach((comment) => {
      const circle = this.shadowRoot.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      if (circle && circle.parentNode) {
        circle.parentNode.removeChild(circle);
      }
    });
  }

  injectStyles() {
    const existingStyle = this.shadowRoot.getElementById(IDS.STYLES);
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement("style");
    style.id = IDS.STYLES;
    style.textContent = getStyles();
    this.shadowRoot.appendChild(style);

    // A few rules (e.g. the comment-mode cursor on document.body) target
    // the host page itself, which a shadow root's stylesheet can't reach —
    // those live in a separate <style> in document.head instead.
    const existingGlobalStyle = document.getElementById(IDS.GLOBAL_STYLES);
    if (existingGlobalStyle) {
      existingGlobalStyle.remove();
    }

    const globalStyle = document.createElement("style");
    globalStyle.id = IDS.GLOBAL_STYLES;
    globalStyle.textContent = getGlobalStyles();
    document.head.appendChild(globalStyle);
  }
}

export default CommentOverlay;
