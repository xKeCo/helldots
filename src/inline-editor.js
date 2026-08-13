// The inline editor that replaces a comment or reply body while it is being
// edited, plus the one question asked before an unsaved draft is thrown away.
//
// This component is deliberately dumb: it renders a draft and reports every
// keystroke back. It does NOT own the draft. The panels re-render constantly
// — ten `render()` call sites in the inbox alone, plus seven `refresh()`
// calls from the overlay — and a draft living in this DOM would be destroyed
// by any of them, silently, mid-sentence. So the owner keeps the draft as
// state (the same reason `detailId` is state) and hands it back on rebuild.

import { CLASSES } from "./constants.js";
import { confirmDialog } from "./confirm-dialog.js";

/**
 * @param {Object} config
 * @param {string} config.value current draft text
 * @param {Object} config.strings
 * @param {(text: string) => void} config.onInput fired on every keystroke
 * @param {(text: string) => void} config.onSave
 * @param {() => void} config.onCancel
 * @returns {HTMLElement}
 */
export const createInlineEditor = ({
  value,
  strings,
  onInput,
  onSave,
  onCancel,
}) => {
  const wrapper = document.createElement("div");
  wrapper.className = CLASSES.EDITOR;

  const input = document.createElement("textarea");
  input.className = CLASSES.EDITOR_INPUT;
  input.value = value;
  input.rows = 3;
  input.setAttribute("aria-label", strings.editorAriaLabel);

  const actions = document.createElement("div");
  actions.className = CLASSES.EDITOR_ACTIONS;

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = CLASSES.EDITOR_CANCEL;
  cancel.textContent = strings.editCancel;

  const save = document.createElement("button");
  save.type = "button";
  save.className = CLASSES.EDITOR_SAVE;
  save.textContent = strings.editSave;

  // An empty body is not a way to delete: the comment would keep its marker,
  // its replies and its row in the inbox while saying nothing. Deleting is
  // its own action, and it asks first.
  const syncSave = () => {
    save.disabled = input.value.trim().length === 0;
  };
  syncSave();

  input.addEventListener("input", () => {
    syncSave();
    onInput(input.value);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // The overlay closes the thread popover on Escape from a bubble-phase
      // listener on `document`. Without this the panel would go too, and the
      // question about the unsaved draft would be asked about something the
      // user can no longer see.
      e.stopPropagation();
      e.preventDefault();
      onCancel();
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !save.disabled) {
      e.preventDefault();
      onSave(input.value);
    }
  });

  cancel.addEventListener("click", (e) => {
    e.stopPropagation();
    onCancel();
  });
  save.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!save.disabled) onSave(input.value);
  });

  actions.appendChild(cancel);
  actions.appendChild(save);
  wrapper.appendChild(input);
  wrapper.appendChild(actions);

  // Re-rendered panels rebuild this element from the stored draft, so the
  // caret has to be put back where a typist expects it rather than at 0.
  queueMicrotask(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  return wrapper;
};

/**
 * Asks before an unsaved draft is thrown away. Callers gate on dirtiness
 * themselves — an untouched editor closes without a question, because there
 * is nothing to lose and a dialog nobody needs teaches people to dismiss
 * dialogs without reading them.
 *
 * @param {any} host node whose root the dialog mounts into
 * @param {Object} strings
 * @returns {Promise<boolean>} true when the draft may be discarded
 */
export const confirmDiscard = (host, strings) =>
  confirmDialog(host, {
    title: strings.confirmDiscardTitle,
    message: strings.confirmDiscardMessage,
    confirmLabel: strings.confirmDiscard,
    cancelLabel: strings.confirmKeepEditing,
  });
