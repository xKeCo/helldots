// The thread popover: lifecycle, in-place editing state, and the placement
// math that keeps a floating panel pinned beside its marker.
//
// Extracted from CommentOverlay as part of splitting the god object
// (DECISIONS.md, Fase 5). Pure view-controller: every data mutation flows
// back through the `actions` contract, so this module never touches
// storage, callbacks to the host app, or the markers themselves.

import { CLASSES, MARKER_SIZE } from "./constants.js";
import {
  createThreadPopover,
  createReplyElement,
  createEditedMark,
  cssAttrValue,
  renderScreenshotsPreview,
  wireScreenshotInput,
  wireScreenshotLightbox,
} from "./components.js";
import { createCommentActions, copyToClipboard } from "./comment-actions.js";
import { createContextBlock } from "./context-block.js";
import { buildAgentContext } from "./agent-context.js";
import { buildCommentLink } from "./link.js";
import { createInlineEditor, confirmDiscard } from "./inline-editor.js";
import { sameId } from "./id.js";

/**
 * Places a floating panel (tooltip or thread popover) beside a marker,
 * clamped to the viewport. Exported on its own because the hover tooltip
 * shares this exact placement without going through the controller.
 * @param {HTMLElement} el
 * @param {HTMLElement} circle
 */
export const positionPopoverAtCircle = (el, circle) => {
  const circleRect = circle.getBoundingClientRect();
  const centerX = circleRect.left + circleRect.width / 2;
  const centerY = circleRect.top + circleRect.height / 2;
  const circleBaseSize = MARKER_SIZE;
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
};

/**
 * Centers a panel in the viewport — the placement for popovers with no
 * marker to pin to (orphaned comments opened from the inbox).
 * @param {HTMLElement} el
 */
export const centerPopover = (el) => {
  const elRect = el.getBoundingClientRect();
  const x = Math.max(10, (window.innerWidth - (elRect.width || 400)) / 2);
  const y = Math.max(10, (window.innerHeight - elRect.height) / 2);
  el.style.left = `${x}px`;
  // Explicitly cleared: this element may have been bottom-anchored by
  // positionPopoverAtCircle, and `top` alone would not win over it.
  el.style.bottom = "auto";
  el.style.top = `${y}px`;
};

export class PopoverController {
  /**
   * @param {{
   *   shadowRoot: ShadowRoot,
   *   strings: Object,
   *   locale: string,
   *   findComment: (id: any) => any,
   *   removeTooltip: (id: any) => void,
   *   onShowLightbox: (src: string) => void,
   *   isInsideLightbox: (target: any) => boolean,
   *   linkParam: () => string,
   *   refreshInbox: () => void,
   *   actorKey: () => string,
   *   actions: {
   *     addReply: Function, deleteReply: Function,
   *     editComment: Function, editReply: Function,
   *     setStatus: Function, setType: Function, setPriority: Function,
   *     deleteComment: Function,
   *     toggleCommentReaction: Function, toggleReplyReaction: Function,
   *   },
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
    /** The open popover element, or null. @type {HTMLElement | null} */
    this.active = null;
    /**
     * The marker the popover follows on scroll. Null for orphaned comments
     * opened from the inbox — those get centered instead.
     * @type {HTMLElement | null}
     */
    this._activeCircle = null;
    /**
     * The popover's open editor. Tracked as state even though the popover
     * mounts it straight into the DOM (it is built once and never
     * re-rendered): Escape, the close button and a click on the page all
     * need to know whether there is unsaved text before they act.
     * @type {{ commentId: any, replyId: any | null, draft: string } | null}
     */
    this.editing = null;
    /** @type {ResizeObserver | null} */
    this._resizeObserver = null;
    /** @type {((e: MouseEvent) => void) | null} */
    this._clickHandler = null;
    /**
     * Pending arm of `_clickHandler`. Held so `close()` can cancel it: the
     * listener goes on `document`, so a timer that outlives teardown installs
     * one nothing is left to remove.
     * @type {ReturnType<typeof setTimeout> | null}
     */
    this._armClickTimer = null;
  }

  /**
   * The body element of the root comment, or of one reply, inside the open
   * popover. Returns whatever is currently there — the text node or the
   * editor that replaced it.
   */
  _bodyEl(replyId = null) {
    const popover = this.active;
    if (!popover) return null;
    if (replyId == null) {
      return popover.querySelector(
        `.${CLASSES.THREAD_SCROLL} > .${CLASSES.THREAD_BODY}, .${CLASSES.THREAD_SCROLL} > .${CLASSES.EDITOR}`
      );
    }
    const row = popover.querySelector(
      `.${CLASSES.THREAD_REPLY}[data-reply-id="${cssAttrValue(replyId)}"]`
    );
    return (
      row?.querySelector(`.${CLASSES.THREAD_BODY}, .${CLASSES.EDITOR}`) || null
    );
  }

  /**
   * Puts the edited text back on screen where the panels do not rebuild
   * themselves: the open thread quotes the text that just changed, and the
   * hover tooltip is thrown away on mouseleave so it needs nothing.
   */
  refreshCommentViews(id, replyId = null) {
    if (this.active?.dataset.for !== String(id)) return;
    const comment = this.deps.findComment(id);
    if (!comment) return;

    const source =
      replyId == null
        ? comment
        : (comment.replies || []).find((r) => sameId(r.id, replyId));
    if (!source) return;

    const body = document.createElement("div");
    body.className = CLASSES.THREAD_BODY;
    body.textContent = source.text;
    this._bodyEl(replyId)?.replaceWith(body);

    // The "edited" mark belongs to the same meta line the author and time
    // are on, and it is absent until the first edit.
    const meta =
      replyId == null
        ? this.active.querySelector(`.${CLASSES.THREAD_META}`)
        : this.active
            .querySelector(
              `.${CLASSES.THREAD_REPLY}[data-reply-id="${cssAttrValue(replyId)}"]`
            )
            ?.querySelector(`.${CLASSES.THREAD_META}`);
    if (
      meta &&
      source.editedAt &&
      !meta.querySelector(`.${CLASSES.THREAD_EDITED}`)
    ) {
      const editedEl = createEditedMark(
        source.editedAt,
        this.deps.strings,
        this.deps.locale
      );
      // Before the ⋯, which `margin-left: auto` has pushed to the far right.
      const actions = meta.querySelector(`.${CLASSES.THREAD_REPLY_ACTIONS}`);
      if (actions) meta.insertBefore(editedEl, actions);
      else meta.appendChild(editedEl);
    }
  }

  /** True while the popover holds an editor at all. */
  isEditing() {
    return this.editing != null;
  }

  /** True while the popover holds an editor with unsaved text. */
  editorDirty() {
    if (!this.editing) return false;
    const { commentId, replyId, draft } = this.editing;
    const comment = this.deps.findComment(commentId);
    const source =
      replyId == null
        ? comment
        : (comment?.replies || []).find((r) => sameId(r.id, replyId));
    return draft.trim() !== String(source?.text || "").trim();
  }

  /**
   * Single gate in front of everything that would take the popover's editor
   * off screen. Mirrors InboxView.releaseEditor so the two panels answer the
   * same question the same way.
   * @returns {Promise<boolean>} true when the caller may proceed
   */
  async releaseEditor() {
    if (!this.editing) return true;
    if (this.editorDirty()) {
      const host = /** @type {any} */ (this.deps.shadowRoot);
      if (!(await confirmDiscard(host, this.deps.strings))) return false;
    }
    const { replyId } = this.editing;
    this.editing = null;
    this._restoreBody(replyId);
    return true;
  }

  _restoreBody(replyId) {
    const comment = this.deps.findComment(this.active?.dataset.for);
    if (!comment) return;
    const source =
      replyId == null
        ? comment
        : (comment.replies || []).find((r) => sameId(r.id, replyId));
    if (!source) return;

    const body = document.createElement("div");
    body.className = CLASSES.THREAD_BODY;
    body.textContent = source.text;
    this._bodyEl(replyId)?.replaceWith(body);
  }

  /**
   * Opens the editor inside the popover. Unlike the inbox this mounts into
   * the DOM directly: the popover is built once and never re-rendered, so
   * there is nothing to survive. The draft is still tracked as state, because
   * Escape, the close button and a click outside all have to know whether
   * there is anything to lose.
   */
  async startEditing(commentId, replyId = null) {
    if (!(await this.releaseEditor())) return;

    const comment = this.deps.findComment(commentId);
    const source =
      replyId == null
        ? comment
        : (comment?.replies || []).find((r) => sameId(r.id, replyId));
    if (!source) return;

    this.editing = { commentId, replyId, draft: source.text };

    const editor = createInlineEditor({
      value: source.text,
      strings: this.deps.strings,
      onInput: (text) => {
        this.editing.draft = text;
      },
      onSave: (text) => {
        const saved =
          replyId == null
            ? this.deps.actions.editComment(commentId, text)
            : this.deps.actions.editReply(commentId, replyId, text);
        this.editing = null;
        if (saved) {
          this.refreshCommentViews(commentId, replyId);
          this.deps.refreshInbox();
        } else {
          this._restoreBody(replyId);
        }
      },
      onCancel: () => {
        this.releaseEditor();
      },
    });

    this._bodyEl(replyId)?.replaceWith(editor);
  }

  // `circle` may be null for orphaned comments (opened from the inbox):
  // the popover is centered in the viewport instead of pinned to a marker.
  show(circle, comment) {
    this.close();

    const { strings, locale } = this.deps;
    this.deps.removeTooltip(comment.id);

    // Keeps the selected marker visibly picked out while its thread is open
    // — same growth as hover, plus a ring, so it survives the pointer
    // leaving the circle to reach the popover.
    circle?.classList.add(CLASSES.CIRCLE_ACTIVE);
    this._activeCircle = circle || null;

    const onDeleteReply = (reply, replyEl) => {
      if (!this.deps.actions.deleteReply(comment.id, reply.id)) return;
      replyEl.remove();
      this.deps.refreshInbox();
    };

    // Named rather than inlined below: `submitReply` builds a reply row too,
    // and when this handler lived only in the call site there, the row the
    // user had just created came out with a ⋯ menu that could delete but not
    // edit — until the popover was reopened and the full render wired both.
    const onEditReply = (reply) => this.startEditing(comment.id, reply.id);

    // One handler for the whole thread: the bar reports which target was
    // clicked, so the root comment and any reply route to their own toggle.
    // Built once, and reused by submitReply below so a reply created in this
    // session gets the same bar a reopened popover would render.
    const reactions = {
      actorKey: this.deps.actorKey(),
      onToggle: (target, emoji) => {
        if (target === comment) {
          this.deps.actions.toggleCommentReaction(comment.id, emoji);
        } else {
          this.deps.actions.toggleReplyReaction(comment.id, target.id, emoji);
        }
      },
    };

    const popover = createThreadPopover(comment, strings, locale, {
      onDeleteReply,
      onEditReply,
      reactions,
    });
    this.deps.shadowRoot.appendChild(popover);

    // Same action strip as the inbox cards: copy agent context, lifecycle
    // status picker (RF09) and the ⋯ menu.
    const headerEl = popover.querySelector(`.${CLASSES.THREAD_HEADER}`);
    const actionsEl = createCommentActions(comment, {
      strings,
      onCopy: (c) =>
        copyToClipboard(
          buildAgentContext(c, {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            strings,
          })
        ),
      onCopyLink: (c) =>
        copyToClipboard(buildCommentLink(c, this.deps.linkParam())),
      onEdit: (c) => this.startEditing(c.id),
      onSetStatus: (c, status) => this.deps.actions.setStatus(c.id, status),
      onSetType: (c, type) => this.deps.actions.setType(c.id, type),
      onSetPriority: (c, priority) =>
        this.deps.actions.setPriority(c.id, priority),
      onDelete: (c) => {
        this.close();
        this.deps.actions.deleteComment(c.id);
        this.deps.refreshInbox();
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
      wireScreenshotLightbox(mainScreenshotsContainer, (src) =>
        this.deps.onShowLightbox(src)
      );
    }

    // RF2 — the automatic capture used to be reachable only from the inbox
    // detail. Collapsed by default so the popover stays a conversation
    // first; built here because it needs the lightbox callback.
    const contextBlock = createContextBlock(comment, {
      strings,
      onShowLightbox: (src) => this.deps.onShowLightbox(src),
      collapsible: true,
    });
    if (contextBlock) {
      // `.before()` rather than popover.insertBefore(): the replies live
      // inside the scroll container, not directly under the popover.
      popover.querySelector(`.${CLASSES.THREAD_REPLIES}`).before(contextBlock);
    }

    setTimeout(() => {
      if (circle) {
        positionPopoverAtCircle(popover, circle);
      } else {
        centerPopover(popover);
      }
    }, 10);

    popover
      .querySelector(`.${CLASSES.CLOSE_TOOLTIP}`)
      .addEventListener("click", async (e) => {
        e.stopPropagation();
        // Unlike a click on the page, pressing × is an unambiguous request
        // to close, so an unsaved draft is worth one question. The guard
        // short-circuits before the await, keeping the no-editor path
        // synchronous.
        if (this.editing && !(await this.releaseEditor())) return;
        this.close();
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
      renderScreenshotsPreview(
        threadScreenshotsContainer,
        pendingReplyScreenshots,
        {
          strings,
          onShow: (dataUrl) => this.deps.onShowLightbox(dataUrl),
          rerender: () => updateReplyScreenshotsPreview(),
        }
      );
    };

    threadAttachBtn.addEventListener("click", () => {
      threadFileInput.click();
    });

    wireScreenshotInput(
      threadFileInput,
      () => pendingReplyScreenshots,
      updateReplyScreenshotsPreview
    );

    const submitReply = () => {
      const text = input.value.trim();
      if (!text && pendingReplyScreenshots.length === 0) return;

      const reply = this.deps.actions.addReply(
        comment,
        text,
        pendingReplyScreenshots.length > 0 ? [...pendingReplyScreenshots] : []
      );

      const repliesContainer = popover.querySelector(
        `.${CLASSES.THREAD_REPLIES}`
      );
      const replyEl = createReplyElement(reply, strings, locale, {
        onDelete: onDeleteReply,
        onEdit: onEditReply,
        reactions,
      });
      repliesContainer.appendChild(replyEl);

      wireScreenshotLightbox(replyEl, (src) => this.deps.onShowLightbox(src));

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

    this.active = popover;

    // Sending a reply, expanding the context block or a screenshot finishing
    // its decode all change the popover's height after it was placed. Without
    // re-running the anchor decision the box keeps the top it was given and
    // grows straight off the bottom of the viewport. Watching the element is
    // the one hook that covers every cause; guarded because jsdom has no
    // ResizeObserver.
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => this.reposition());
      this._resizeObserver.observe(popover);
    }

    setTimeout(() => input.focus(), 50);

    // Deferred so the gesture that opened this popover cannot immediately
    // close it. Cancellable, because `close()` may run first.
    this._armClickTimer = setTimeout(() => {
      this._armClickTimer = null;
      this._clickHandler = (e) => {
        const target = /** @type {Node} */ (e.composedPath()[0] || e.target);
        if (
          !popover.contains(target) &&
          !circle?.contains(target) &&
          !this.deps.isInsideLightbox(target)
        ) {
          // A click on the page while text is unsaved is an ambiguous
          // gesture — maybe the user went to look at the thing they are
          // describing. Answering it with a modal would interrupt them, and
          // interrupting often teaches people to dismiss without reading. So
          // the panel simply stays put; the textarea still on screen says
          // everything the dialog would have.
          if (this.editorDirty()) return;
          this.close();
        }
      };
      document.addEventListener("mousedown", this._clickHandler);
    }, 0);
  }

  close() {
    // Queried rather than remembered: the marker can be re-rendered while
    // its popover is open, and the stale reference would keep the class.
    this.deps.shadowRoot
      ?.querySelectorAll(`.${CLASSES.CIRCLE_ACTIVE}`)
      .forEach((/** @type {HTMLElement} */ el) =>
        el.classList.remove(CLASSES.CIRCLE_ACTIVE)
      );
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    // Every route here has already answered for the draft, and the DOM it
    // lived in is about to go.
    this.editing = null;
    if (this.active) {
      this.active.remove();
      this.active = null;
    }
    this._activeCircle = null;
    if (this._armClickTimer) {
      clearTimeout(this._armClickTimer);
      this._armClickTimer = null;
    }
    if (this._clickHandler) {
      document.removeEventListener("mousedown", this._clickHandler);
      this._clickHandler = null;
    }
  }

  /**
   * Re-runs the open popover's placement against its current size. Split
   * from syncToMarker because that one also decides visibility from the
   * marker, which is wrong here: a popover resizing while its marker is
   * off-screen must stay hidden, not reappear.
   */
  reposition() {
    const popover = this.active;
    if (!popover || popover.style.display === "none") return;

    if (this._activeCircle) {
      positionPopoverAtCircle(popover, this._activeCircle);
    } else {
      centerPopover(popover);
    }
  }

  /**
   * Keeps the open thread popover pinned beside its marker while the page
   * scrolls, and hides it while the marker is off-screen.
   *
   * Hidden, not closed: a half-typed reply must survive scrolling the marker
   * out of view and back. Closing here would also fight the outside-click
   * handler, which is the thing that legitimately dismisses the popover.
   */
  syncToMarker() {
    const popover = this.active;
    const circle = this._activeCircle;
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
    positionPopoverAtCircle(popover, circle);
  }
}
