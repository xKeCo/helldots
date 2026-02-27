import html2canvas from "html2canvas";
import { CLASSES, IDS, SELECTORS } from "./constants.js";
import { getStyles } from "./styles.js";
import {
  createToolbar,
  createCommentBox,
  createCommentCircle,
  createTooltip,
  createThreadPopover,
  createReplyElement,
} from "./components.js";

class CommentOverlay {
  constructor(options = {}) {
    this.comments = [];
    this.commentMode = false;
    this.isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    this.options = {
      shortcutKey: options.shortcutKey || (this.isMac ? "c" : "C"),
      shortcutModifier: options.shortcutModifier || "alt",
      ...options,
    };

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
    // Create and append UI elements
    this.toolbar = createToolbar(this.options);
    this.commentBox = createCommentBox();
    this.overlay = document.createElement("div");
    this.overlay.className = CLASSES.COMMENT_OVERLAY;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.toolbar);
    document.body.appendChild(this.commentBox);

    this.commentBtn = this.toolbar.querySelector(
      `.${CLASSES.TOOLBAR_COMMENT_BTN}`
    );
    this.submitButton = document.getElementById(IDS.SUBMIT_COMMENT);
    this.commentInput = document.getElementById(IDS.COMMENT_INPUT);
    this.attachImageBtn = this.commentBox.querySelector(
      `.${CLASSES.ATTACH_IMAGE_BTN}`
    );
    this.attachImageInput = document.getElementById(IDS.ATTACH_IMAGE_INPUT);

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
      const file = e.target.files[0];
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

    document.addEventListener("mousedown", (e) => this.handleDocumentClick(e));
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

    if (
      this.toolbar.contains(e.target) ||
      e.target.closest(`.${CLASSES.CIRCLE}`) ||
      e.target.closest(`.${CLASSES.TOOLTIP}`) ||
      e.target.closest(`.${CLASSES.THREAD_POPOVER}`) ||
      e.target.closest(`.${CLASSES.LIGHTBOX}`)
    ) {
      return;
    }

    if (this.commentBox.contains(e.target)) {
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
      document.body.appendChild(this._selectionRect);
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

    const relativeX = (clientX - containerRect.left) / containerRect.width;
    const relativeY = (clientY - containerRect.top) / containerRect.height;

    this.currentPosition = {
      container,
      relativeX,
      relativeY,
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
      img.onclick = () => this.showLightbox(dataUrl);

      const removeBtn = document.createElement("button");
      removeBtn.className = CLASSES.SCREENSHOT_REMOVE;
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
      id: Date.now(),
      replies: [],
      author: "Anonymous",
      createdAt: new Date().toISOString(),
      screenshots: this._pendingScreenshots
        ? [...this._pendingScreenshots]
        : [],
    };

    this.comments.push(comment);
    this.renderCommentCircle(comment);
    this.hideCommentBox();
    this.toggleCommentMode();

    const circle = document.querySelector(`[data-comment-id="${comment.id}"]`);
    if (circle) {
      this.showThreadPopover(circle, comment);
    }
  }

  renderCommentCircle(comment) {
    const circle = createCommentCircle(comment);

    circle.addEventListener("mouseenter", () =>
      this.showCommentTooltip(circle, comment)
    );
    circle.addEventListener("mouseleave", () => {
      setTimeout(() => {
        const tooltip = document.querySelector(
          `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
        );
        if (tooltip && !tooltip.matches(":hover")) {
          tooltip.remove();
        }
      }, 250);
    });

    circle.addEventListener("click", (e) => {
      e.stopPropagation();
      const tooltip = document.querySelector(
        `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
      );
      if (tooltip) tooltip.remove();
      this.showThreadPopover(circle, comment);
    });

    this.overlay.appendChild(circle);
    this.updateCommentPosition(comment, circle);

    this.createResizeObserver(comment, circle);
    this.createMutationObserver(comment, circle);
  }

  showCommentTooltip(circle, comment) {
    const existingPopover = document.querySelector(
      `.${CLASSES.THREAD_POPOVER}[data-for="${comment.id}"]`
    );
    if (existingPopover) return;

    const existingTooltip = document.querySelector(
      `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
    );
    if (existingTooltip) return;

    const tooltip = createTooltip(comment);
    document.body.appendChild(tooltip);

    tooltip.querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`).forEach((img) => {
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

    const existingTooltip = document.querySelector(
      `.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`
    );
    if (existingTooltip) existingTooltip.remove();

    const popover = createThreadPopover(comment);
    document.body.appendChild(popover);

    const mainScreenshotsContainer = popover.querySelector(
      `:scope > .${CLASSES.SCREENSHOTS_CONTAINER}`
    );
    if (mainScreenshotsContainer) {
      mainScreenshotsContainer
        .querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`)
        .forEach((img) => {
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

    const input = popover.querySelector(`.${CLASSES.THREAD_INPUT}`);
    const submitBtn = popover.querySelector(`.${CLASSES.THREAD_SUBMIT}`);
    const threadAttachBtn = popover.querySelector(
      `.${CLASSES.THREAD_INPUT_AREA} .${CLASSES.ATTACH_IMAGE_BTN}`
    );
    const threadFileInput = popover.querySelector(
      `.${CLASSES.THREAD_INPUT_AREA} input[type="file"]`
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
      const file = e.target.files[0];
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
      const replyEl = createReplyElement(reply);
      repliesContainer.appendChild(replyEl);

      replyEl.querySelectorAll(`.${CLASSES.SCREENSHOT_IMG}`).forEach((img) => {
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
        if (!popover.contains(e.target) && !circle.contains(e.target)) {
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

    const closeBtn = document.createElement("button");
    closeBtn.className = CLASSES.LIGHTBOX_CLOSE;
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => this.closeLightbox());

    lightbox.appendChild(img);
    lightbox.appendChild(closeBtn);

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) this.closeLightbox();
    });

    document.body.appendChild(lightbox);
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
      author: "Anonymous",
      timestamp: new Date().toISOString(),
      screenshots,
    };
    comment.replies.push(reply);
    return reply;
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
          const circle = document.querySelector(
            `[data-comment-id="${comment.id}"]`
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
   * @param {HTMLElement} circle
   */
  createMutationObserver(comment, circle) {
    if (!window.MutationObserver) return;

    // Disconnect existing for this comment if any
    if (this.mutationObservers.has(comment.id)) {
      try {
        this.mutationObservers.get(comment.id).disconnect();
      } catch (_) {}
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
        } catch (_) {}
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

    // Remove all comment circles
    this.comments.forEach((comment) => {
      const circle = document.querySelector(
        `[data-comment-id="${comment.id}"]`
      );
      if (circle && circle.parentNode) {
        circle.parentNode.removeChild(circle);
      }
    });
  }

  injectStyles() {
    const existingStyle = document.getElementById(IDS.STYLES);
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement("style");
    style.id = IDS.STYLES;
    style.textContent = getStyles();
    document.head.appendChild(style);
  }
}

export default CommentOverlay;
