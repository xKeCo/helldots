import { CLASSES, IDS, SELECTORS } from './constants.js';
import { getStyles } from './styles.js';
import {
  createToolbar,
  createCommentBox,
  createCommentCircle,
  createTooltip,
} from './components.js';

class CommentOverlay {
  constructor(options = {}) {
    this.comments = [];
    this.commentMode = false;
    this.isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    this.options = {
      shortcutKey: options.shortcutKey || (this.isMac ? 'c' : 'C'),
      shortcutModifier: options.shortcutModifier || 'alt',
      ...options,
    };

    // Initialize resize observers and position validation
    this.resizeObservers = new Map();
    // Track mutation observers per comment
    this.mutationObservers = new Map();
    this.positionValidationEnabled = true;

    // rAF scheduling flag for bulk updates
    this._pendingRaf = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initOverlay());
    } else {
      this.initOverlay();
    }
  }

  initOverlay() {
    // Create and append UI elements
    this.toolbar = createToolbar(this.options);
    this.commentBox = createCommentBox();
    this.overlay = document.createElement('div');
    this.overlay.className = CLASSES.COMMENT_OVERLAY;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.toolbar);
    document.body.appendChild(this.commentBox);

    // Get references to DOM elements
    this.toolbarContent = this.toolbar.querySelector(`.${CLASSES.TOOLBAR_CONTENT}`);
    this.submitButton = document.getElementById(IDS.SUBMIT_COMMENT);
    this.cancelButton = document.getElementById(IDS.CANCEL_COMMENT);
    this.commentInput = document.getElementById(IDS.COMMENT_INPUT);

    // Bind event listeners
    this.bindEventListeners();
    this.setupKeyboardShortcut();
    this.setupResizeHandlers();
    this.injectStyles();
  }

  bindEventListeners() {
    this.toolbarContent.addEventListener('click', () => this.toggleCommentMode());
    this.submitButton.addEventListener('click', () => this.saveComment());
    this.cancelButton.addEventListener('click', () => this.hideCommentBox());

    this.commentInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.saveComment();
      }
    });

    document.addEventListener('mousedown', (e) => this.handleDocumentClick(e));
  }

  setupKeyboardShortcut() {
    // Remove any existing event listeners
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }

    // Create a new handler with proper binding
    this.keydownHandler = (e) => {
      const isMacOptionC = this.isMac && e.altKey && (e.key === 'ç' || e.key === 'Ç');
      const isWindowsAltC = !this.isMac && e.altKey && e.key.toLowerCase() === 'c';
      const isCustomShortcut =
        e.key.toLowerCase() === this.options.shortcutKey.toLowerCase() &&
        ((this.options.shortcutModifier === 'alt' && e.altKey) ||
          (this.options.shortcutModifier === 'ctrl' && (e.ctrlKey || e.metaKey)) ||
          (this.options.shortcutModifier === 'shift' && e.shiftKey));

      if (isMacOptionC || isWindowsAltC || isCustomShortcut) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleCommentMode();
        this.flashButton();
        return false;
      }
    };

    // Add the event listener
    document.addEventListener('keydown', this.keydownHandler);
  }

  handleDocumentClick(e) {
    if (!this.commentMode) return;

    if (
      this.toolbar.contains(e.target) ||
      this.commentBox.contains(e.target) ||
      e.target.closest(`.${CLASSES.CIRCLE}`) ||
      e.target.closest(`.${CLASSES.TOOLTIP}`)
    ) {
      return;
    }

    // Only prevent default for left clicks to avoid interfering with scroll
    if (e.button === 0) {
      e.preventDefault();
    }

    // Determine the underlying element at the click point, even if overlay is on top
    const clientX = e.clientX;
    const clientY = e.clientY;

    // Temporarily disable overlay pointer events to detect underlying element
    const prevPointerEvents = this.overlay.style.pointerEvents;
    this.overlay.style.pointerEvents = 'none';
    const underlying = document.elementFromPoint(clientX, clientY);
    // restore
    this.overlay.style.pointerEvents = prevPointerEvents || '';

    const container =
      (underlying && underlying.closest && underlying.closest(SELECTORS.CONTAINER)) ||
      document.body;
    const containerRect = container.getBoundingClientRect();

    // Calculate precise relative position
    const relativeX = (clientX - containerRect.left) / containerRect.width;
    const relativeY = (clientY - containerRect.top) / containerRect.height;

    // Store position data
    this.currentPosition = {
      container,
      relativeX,
      relativeY,
    };

    // Use viewport coordinates for comment box positioning
    this.showCommentBox(clientX, clientY);
  }

  showCommentBox(x, y) {
    this.commentBox.style.display = 'block';

    const boxWidth = 300;
    const boxHeight = 150;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Calculate position relative to viewport (considering scroll)
    let adjustedX = Math.min(x, windowWidth - boxWidth);
    let adjustedY = Math.min(y, windowHeight - boxHeight);

    // Ensure the box stays within viewport bounds
    adjustedX = Math.max(0, adjustedX);
    adjustedY = Math.max(0, adjustedY);

    // Position the comment box using fixed positioning
    this.commentBox.style.left = `${adjustedX}px`;
    this.commentBox.style.top = `${adjustedY}px`;

    this.commentInput.value = '';
    setTimeout(() => this.commentInput.focus(), 50);
  }

  hideCommentBox() {
    this.commentBox.style.display = 'none';
    this.currentPosition = null;
  }

  toggleCommentMode() {
    this.commentMode = !this.commentMode;
    this.toolbarContent.classList.toggle(CLASSES.ACTIVE, this.commentMode);
    this.overlay.classList.toggle(CLASSES.ACTIVE, this.commentMode);
    document.body.classList.toggle(CLASSES.COMMENT_CURSOR, this.commentMode);

    if (!this.commentMode) {
      this.hideCommentBox();
    }
  }

  flashButton() {
    this.toolbarContent.classList.add(CLASSES.FLASH);
    setTimeout(() => {
      this.toolbarContent.classList.remove(CLASSES.FLASH);
    }, 300);
  }

  saveComment() {
    if (!this.commentInput.value.trim() || !this.currentPosition) return;

    const comment = {
      text: this.commentInput.value,
      container: this.currentPosition.container,
      relativeX: this.currentPosition.relativeX,
      relativeY: this.currentPosition.relativeY,
      id: Date.now(),
    };

    this.comments.push(comment);
    this.renderCommentCircle(comment);
    this.hideCommentBox();
    this.toggleCommentMode();
  }

  renderCommentCircle(comment) {
    const circle = createCommentCircle(comment);

    // Add event listeners
    circle.addEventListener('mouseenter', () => this.showCommentTooltip(circle, comment));
    circle.addEventListener('mouseleave', () => {
      setTimeout(() => {
        const tooltip = document.querySelector(`.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`);
        if (tooltip && !tooltip.matches(':hover')) {
          tooltip.remove();
        }
      }, 250);
    });

    circle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showCommentTooltip(circle, comment);
    });

    // Render circle inside the fixed viewport overlay layer
    this.overlay.appendChild(circle);

    // Update position using validation system
    this.updateCommentPosition(comment, circle);

    // Debug position for development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      setTimeout(() => this.debugPosition(comment, circle), 100);
    }

    // Create observers for dynamic position updates
    this.createResizeObserver(comment, circle);
    this.createMutationObserver(comment, circle);
  }

  showCommentTooltip(circle, comment) {
    const existingTooltip = document.querySelector(`.${CLASSES.TOOLTIP}[data-for="${comment.id}"]`);
    if (existingTooltip) return;

    const tooltip = createTooltip(comment, circle);

    // Add tooltip to DOM first
    document.body.appendChild(tooltip);

    // Position tooltip after a small delay to ensure circle is rendered
    setTimeout(() => {
      const circleRect = circle.getBoundingClientRect();

      // Simple positioning: place tooltip next to the circle
      const tooltipX = circleRect.right + 10;
      const tooltipY = circleRect.top;

      // Position tooltip using fixed positioning
      tooltip.style.left = `${tooltipX}px`;
      tooltip.style.top = `${tooltipY}px`;
    }, 10);

    // Add close functionality
    tooltip.querySelector(`.${CLASSES.CLOSE_TOOLTIP}`).addEventListener('click', (e) => {
      e.stopPropagation();
      tooltip.remove();
    });

    tooltip.addEventListener('mouseleave', () => tooltip.remove());
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
      console.warn('Container has invalid dimensions, skipping position calculation');
      return null;
    }

    // Use simple relative positioning for consistent results
    const absoluteX = comment.relativeX * containerWidth;
    const absoluteY = comment.relativeY * containerHeight;

    // Ensure position stays within container bounds with small margin for circle size
    const circleRadius = 14; // Half of circle width (28px)
    const validatedX = Math.max(circleRadius, Math.min(absoluteX, containerWidth - circleRadius));
    const validatedY = Math.max(circleRadius, Math.min(absoluteY, containerHeight - circleRadius));

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

    // Compute viewport-based position inside the fixed overlay
    const viewportX = positionData.containerLeft + positionData.absoluteX;
    const viewportY = positionData.containerTop + positionData.absoluteY;

    // Update the circle position using absolute positioning within overlay
    circle.style.left = `${viewportX}px`;
    circle.style.top = `${viewportY}px`;
    circle.style.transform = 'translate(-50%, -50%)';
    circle.style.position = 'absolute';

    // Update the comment's relative position if it was adjusted
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
          const circle = document.querySelector(`[data-comment-id="${comment.id}"]`);
          if (circle) this.updateCommentPosition(comment, circle);
        });
      });
    };

    // Window resize handler for viewport changes
    this.windowResizeHandler = () => {
      this.scheduleUpdatePositions();
    };
    window.addEventListener('resize', this.windowResizeHandler, { passive: true });

    // Capture scroll on any scrolling ancestor
    this.scrollHandler = () => {
      this.scheduleUpdatePositions();
    };
    window.addEventListener('scroll', this.scrollHandler, { capture: true, passive: true });

    // Update after resources load (images, fonts)
    this.loadHandler = () => {
      this.scheduleUpdatePositions();
    };
    window.addEventListener('load', this.loadHandler);
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

    console.log('Position Debug:', {
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
        x: circleRect.left + circleRect.width / 2 - (containerRect.left + expectedX),
        y: circleRect.top + circleRect.height / 2 - (containerRect.top + expectedY),
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
      console.warn('ResizeObserver not supported, position validation will be limited');
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
    // Remove window resize handler
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
    }

    // Remove scroll handler
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, { capture: true });
    }

    // Remove load handler
    if (this.loadHandler) {
      window.removeEventListener('load', this.loadHandler);
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
      document.removeEventListener('keydown', this.keydownHandler);
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
      const circle = document.querySelector(`[data-comment-id="${comment.id}"]`);
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

    const style = document.createElement('style');
    style.id = IDS.STYLES;
    style.textContent = getStyles();
    document.head.appendChild(style);
  }
}

export default CommentOverlay;
