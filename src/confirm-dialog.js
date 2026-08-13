// A modal confirmation for the destructive actions. Deleting a comment or a
// reply is the only thing in the widget that cannot be undone — there is no
// trash and no history — and until now a single click on a menu item did it.
//
// Deliberately promise-based rather than callback-based: every call site
// reads as "ask, then act", and the "user said no" path is a plain early
// return instead of a second callback that does nothing.

import { CLASSES, Z_INDEX } from "./constants.js";

/**
 * @typedef {{
 *   title: string,
 *   message: string,
 *   confirmLabel: string,
 *   cancelLabel: string,
 * }} ConfirmStrings
 */

/**
 * Open dialogs, so teardown can settle them. Without this, unmounting the
 * widget mid-question would take the DOM away and leave the capture-phase
 * keydown listener on `document` swallowing Escape for the whole page.
 * @type {Set<(result: boolean) => void>}
 */
const openDialogs = new Set();

/** Dismisses every open dialog as if the user had cancelled. */
export const closeOpenConfirmDialogs = () => {
  for (const dismiss of [...openDialogs]) dismiss(false);
};

/**
 * Opens the dialog and resolves once the user answers.
 *
 * @param {ShadowRoot | HTMLElement} host where to mount — pass the widget's
 *   shadow root so the dialog inherits its styles and stacking context
 * @param {ConfirmStrings} strings all pre-localized, like every other view
 *   builder here
 * @returns {Promise<boolean>} true only when the user confirms
 */
export const confirmDialog = (
  host,
  { title, message, confirmLabel, cancelLabel }
) =>
  new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = CLASSES.CONFIRM;
    backdrop.style.zIndex = String(Z_INDEX.CONFIRM);

    const panel = document.createElement("div");
    panel.className = CLASSES.CONFIRM_PANEL;
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");

    const titleEl = document.createElement("h2");
    titleEl.className = CLASSES.CONFIRM_TITLE;
    titleEl.textContent = title;
    // Generated rather than a constant id: two dialogs must never claim the
    // same one, and the shadow root is shared with everything else.
    titleEl.id = `hd-confirm-title-${Math.random().toString(36).slice(2, 9)}`;
    panel.setAttribute("aria-labelledby", titleEl.id);

    const messageEl = document.createElement("p");
    messageEl.className = CLASSES.CONFIRM_MESSAGE;
    messageEl.textContent = message;

    const actions = document.createElement("div");
    actions.className = CLASSES.CONFIRM_ACTIONS;

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = CLASSES.CONFIRM_CANCEL;
    cancelBtn.textContent = cancelLabel;

    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = CLASSES.CONFIRM_ACCEPT;
    acceptBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(acceptBtn);
    panel.appendChild(titleEl);
    panel.appendChild(messageEl);
    panel.appendChild(actions);
    backdrop.appendChild(panel);

    // Restored on close: the menu item that opened this is gone by then, so
    // without it focus would fall back to <body> and the keyboard user would
    // lose their place entirely.
    const previouslyFocused = /** @type {any} */ (
      /** @type {any} */ (host).activeElement || document.activeElement
    );

    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      openDialogs.delete(settle);
      document.removeEventListener("keydown", onKeydown, true);
      backdrop.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };

    // Capture phase, and it stops the event: the overlay's own Escape handler
    // is on document and would otherwise close the thread popover behind the
    // dialog while the question was still on screen.
    const onKeydown = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        settle(false);
        return;
      }
      if (e.key !== "Tab") return;
      // aria-modal is a claim about focus, so it has to be true. Only two
      // stops, which makes the trap a swap rather than a ring walk.
      const focusables = [cancelBtn, acceptBtn];
      const active = /** @type {any} */ (
        /** @type {any} */ (host).activeElement || document.activeElement
      );
      const index = focusables.indexOf(active);
      e.preventDefault();
      const next = e.shiftKey
        ? focusables[(index <= 0 ? focusables.length : index) - 1]
        : focusables[(index + 1) % focusables.length];
      next.focus();
    };

    cancelBtn.addEventListener("click", () => settle(false));
    acceptBtn.addEventListener("click", () => settle(true));
    // Only a press that both starts and ends on the backdrop dismisses, so a
    // drag that happens to release outside the panel does not answer for the
    // user.
    let pressedBackdrop = false;
    backdrop.addEventListener("mousedown", (e) => {
      pressedBackdrop = e.target === backdrop;
      // The inbox and the thread popover both close on any mousedown outside
      // themselves; without this they tear down behind the dialog.
      e.stopPropagation();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop && pressedBackdrop) settle(false);
      pressedBackdrop = false;
    });

    openDialogs.add(settle);
    document.addEventListener("keydown", onKeydown, true);
    // Callers reach us through getRootNode(), which is the Document — not a
    // shadow root — for anything mounted in the light DOM. A Document cannot
    // take a second element child, so mount into its body instead.
    const mountPoint = /** @type {any} */ (host).body || host;
    mountPoint.appendChild(backdrop);
    // Cancel, not confirm: the destructive button should never be one stray
    // Enter away.
    cancelBtn.focus();
  });
