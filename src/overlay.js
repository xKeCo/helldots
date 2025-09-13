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

    const container = e.target.closest(SELECTORS.CONTAINER) || document.body;
    const containerRect = container.getBoundingClientRect();

    // Calculate relative position considering scroll
    const relativeX = (e.clientX - containerRect.left) / containerRect.width;
    const relativeY = (e.clientY - containerRect.top) / containerRect.height;

    this.currentPosition = {
      container,
      relativeX,
      relativeY,
    };

    // Use viewport coordinates for comment box positioning
    this.showCommentBox(e.clientX, e.clientY);
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

    // Ensure container has relative positioning
    if (window.getComputedStyle(comment.container).position === 'static') {
      comment.container.style.position = 'relative';
    }

    // Add to container
    comment.container.appendChild(circle);

    // Store the circle for cleanup
    this.resizeObservers = this.resizeObservers || new Map();
    this.resizeObservers.set(comment.id, {
      circle: circle,
    });
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
      const { circle } = this.resizeObservers.get(commentId);
      if (circle && circle.parentNode) {
        circle.parentNode.removeChild(circle);
      }
      this.resizeObservers.delete(commentId);
    }
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
