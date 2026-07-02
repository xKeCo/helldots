import html2canvas from "html2canvas";
import { CLASSES, IDS, SELECTORS } from "./constants.js";
import { getStyles, getGlobalStyles } from "./styles.js";
import { getShadowRoot } from "./root-element.js";
import { getStrings, detectLocale } from "./i18n.js";
import { createAnchor, resolveAnchor } from "./anchor.js";
import {
  createToolbar,
  createCommentBox,
  createCommentCircle,
  createTooltip,
  createThreadPopover,
  createReplyElement,
} from "./components.js";

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
  }

  bindEventListeners() {
    this.commentBtn.addEventListener("click", () => this.toggleCommentMode());
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
      target.closest?.(`.${CLASSES.CIRCLE}`) ||
      target.closest?.(`.${CLASSES.TOOLTIP}`) ||
      target.closest?.(`.${CLASSES.THREAD_POPOVER}`) ||
      target.closest?.(`.${CLASSES.LIGHTBOX}`)
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
        this.overlay.style.display = "none";
        try {
          if (!this._pendingScreenshots) this._pendingScreenshots = [];
          const canvas = await html2canvas(document.body, {
            x: left + window.scrollX,
            y: top + window.scrollY,
            width,
            height,
            windowWidth: document.documentElement.scrollWidth,
            windowHeight: document.documentElement.scrollHeight,
          });
          if (this._pendingScreenshots.length < 5) {
            this._pendingScreenshots.push(canvas.toDataURL("image/png"));
          }
        } catch (err) {
          console.warn("Screenshot capture failed:", err);
        }
        this.overlay.style.display = "";
      }

      this._placeCommentAtPoint(e.clientX, e.clientY);
    } else {
      this._placeCommentAtPoint(this._dragStart.x, this._dragStart.y);
    }

    this._isDragging = false;
    this._dragStart = null;
  }

  _placeCommentAtPoint(clientX, clientY) {
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

    this.currentPosition = {
      container,
      relativeX,
      relativeY,
      anchor: createAnchor(container, relativeX, relativeY),
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

    const boxWidth = 300;
    const circleBaseSize = 28;
    const circleRadius = circleBaseSize / 2;
    const offset = circleRadius + 10;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const centerX = x + circleRadius;
    const centerY = y + circleRadius;

    let adjustedX = centerX + offset;
    let adjustedY = centerY - circleRadius;

    if (adjustedX + boxWidth > windowWidth) {
      adjustedX = centerX - offset - boxWidth;
    }
    adjustedX = Math.max(10, adjustedX);

    const boxRect = this.commentBox.getBoundingClientRect();
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

    if (this.commentMode) {
      document.body.classList.add(CLASSES.COMMENT_CURSOR);
    }
  }

  toggleCommentMode() {
    this.commentMode = !this.commentMode;
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
      id: Date.now(),
      replies: [],
      author: this.strings.anonymous,
      createdAt: new Date().toISOString(),
      screenshots: this._pendingScreenshots
        ? [...this._pendingScreenshots]
        : [],
    };

    this.comments.push(comment);
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

  showThreadPopover(circle, comment) {
    this.closeThreadPopover();

    const existingTooltip = this.shadowRoot.querySelector(
      `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
    );
    if (existingTooltip) existingTooltip.remove();

    const popover = createThreadPopover(comment, this.strings, this.locale);
    this.shadowRoot.appendChild(popover);

    const mainScreenshotsContainer = Array.from(popover.children).find(
      (child) => child.classList.contains(CLASSES.SCREENSHOTS_CONTAINER)
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

    setTimeout(() => {
      this.positionPopoverAtCircle(popover, circle);
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
      const replyEl = createReplyElement(reply, this.strings, this.locale);
      repliesContainer.appendChild(replyEl);

      replyEl
        .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
        .forEach((/** @type {HTMLImageElement} */ img) => {
          img.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showLightbox(img.src);
          });
        });

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

    setTimeout(() => input.focus(), 50);

    setTimeout(() => {
      this._threadClickHandler = (e) => {
        const target = e.composedPath()[0] || e.target;
        if (!popover.contains(target) && !circle.contains(target)) {
          this.closeThreadPopover();
        }
      };
      document.addEventListener("mousedown", this._threadClickHandler);
    }, 0);
  }

  closeThreadPopover() {
    if (this.activeThreadPopover) {
      this.activeThreadPopover.remove();
      this.activeThreadPopover = null;
    }
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

  addReply(comment, text, screenshots = []) {
    if (!comment.replies) comment.replies = [];
    const reply = {
      id: Date.now(),
      text,
      author: this.strings.anonymous,
      timestamp: new Date().toISOString(),
      screenshots,
    };
    comment.replies.push(reply);
    this.options.onReplyAdded?.(
      this._serializeComment(comment),
      this._serializeReply(reply)
    );
    return reply;
  }

  _serializeReply({ id, text, author, timestamp }) {
    return { id, text, author, timestamp };
  }

  /**
   * Serializable snapshot of one comment: the live `container` element is
   * replaced by its `anchor`; screenshots stay out (heavy data-URLs — the
   * host app can persist them separately keyed by comment id).
   */
  _serializeComment(comment) {
    return {
      id: comment.id,
      text: comment.text,
      anchor: comment.anchor || null,
      replies: (comment.replies || []).map((reply) =>
        this._serializeReply(reply)
      ),
      author: comment.author,
      createdAt: comment.createdAt,
    };
  }

  /**
   * @returns {import('./index.d.ts').SerializedComment[]}
   */
  serializeComments() {
    return this.comments.map((comment) => this._serializeComment(comment));
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
   * @returns {{ anchored: number, orphaned: number }}
   */
  loadComments(data) {
    let anchored = 0;
    let orphaned = 0;
    if (!Array.isArray(data)) return { anchored, orphaned };

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
        container: null,
        relativeX: 0,
        relativeY: 0,
        replies: Array.isArray(item.replies) ? [...item.replies] : [],
        author: item.author || this.strings.anonymous,
        createdAt: item.createdAt || new Date().toISOString(),
        screenshots: [],
      };

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

    return { anchored, orphaned };
  }

  positionPopoverAtCircle(el, circle) {
    const circleRect = circle.getBoundingClientRect();
    const centerX = circleRect.left + circleRect.width / 2;
    const centerY = circleRect.top + circleRect.height / 2;
    const circleBaseSize = 28;
    const offset = circleBaseSize / 2 + 10;

    let x = centerX + offset;
    let y = centerY - circleBaseSize / 2;

    if (x + 400 > window.innerWidth) {
      x = centerX - offset - 400;
    }
    x = Math.max(10, x);

    const elRect = el.getBoundingClientRect();
    if (y + elRect.height > window.innerHeight) {
      y = window.innerHeight - elRect.height - 10;
    }
    y = Math.max(10, y);

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
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

    // Validate that container has valid dimensions
    if (containerWidth <= 0 || containerHeight <= 0) {
      console.warn(
        "Container has invalid dimensions, skipping position calculation"
      );
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
  updateCommentPosition(comment, circle) {
    const positionData = this.validateAndCalculatePosition(comment, circle);

    if (!positionData) return;

    // Offset so the circle's top-left tip (sharp corner) aligns with the stored position
    const circleRadius = 14;
    const viewportX =
      positionData.containerLeft + positionData.absoluteX + circleRadius;
    const viewportY =
      positionData.containerTop + positionData.absoluteY + circleRadius;

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
        if (!this.positionValidationEnabled) return;
        this.comments.forEach((comment) => {
          /** @type {HTMLElement} */
          const circle = /** @type {any} */ (
            this.shadowRoot.querySelector(`[data-comment-id="${comment.id}"]`)
          );
          if (circle) this.updateCommentPosition(comment, circle);
        });
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
    this.closeThreadPopover();
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
