import { describe, it, expect, afterEach, vi } from "vitest";
import { createInlineEditor, confirmDiscard } from "../src/inline-editor.js";
import { CLASSES } from "../src/constants.js";
import en from "../src/locales/en.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const mount = (handlers = {}) => {
  const el = createInlineEditor({
    value: "original text",
    strings: en,
    onInput: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    ...handlers,
  });
  document.body.appendChild(el);
  return el;
};

const input = (el) => el.querySelector(`.${CLASSES.EDITOR_INPUT}`);
const save = (el) => el.querySelector(`.${CLASSES.EDITOR_SAVE}`);
const cancel = (el) => el.querySelector(`.${CLASSES.EDITOR_CANCEL}`);
const click = (el) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const type = (el, text) => {
  input(el).value = text;
  input(el).dispatchEvent(new Event("input", { bubbles: true }));
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createInlineEditor", () => {
  it("opens on the draft it was handed, not on an empty box", () => {
    const el = mount();
    expect(input(el).value).toBe("original text");
    expect(input(el).getAttribute("aria-label")).toBe(en.editorAriaLabel);
  });

  it("reports every keystroke so the owner can keep the draft as state", () => {
    // The panels re-render constantly; a draft living only in this textarea
    // would be wiped by any of them.
    const onInput = vi.fn();
    const el = mount({ onInput });
    type(el, "rewritten");
    expect(onInput).toHaveBeenCalledWith("rewritten");
  });

  it("refuses to save a blank body", () => {
    // Blanking is not a back door to deletion: the comment would keep its
    // marker, its replies and its inbox row while saying nothing.
    const onSave = vi.fn();
    const el = mount({ onSave });

    type(el, "   ");
    expect(save(el).disabled).toBe(true);
    click(save(el));
    expect(onSave).not.toHaveBeenCalled();

    type(el, "something");
    expect(save(el).disabled).toBe(false);
    click(save(el));
    expect(onSave).toHaveBeenCalledWith("something");
  });

  it("saves on Cmd/Ctrl+Enter but not on a bare Enter", () => {
    const onSave = vi.fn();
    const el = mount({ onSave });
    type(el, "edited");

    input(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(onSave).not.toHaveBeenCalled();

    input(el).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
      })
    );
    expect(onSave).toHaveBeenCalledWith("edited");
  });

  it("cancels on Escape without letting it reach the panel behind", () => {
    // The overlay closes the thread popover on Escape from a listener on
    // `document`. Without stopPropagation the panel would go too, and the
    // question about the draft would be about something already gone.
    const onCancel = vi.fn();
    const onDocumentEscape = vi.fn();
    document.addEventListener("keydown", onDocumentEscape);
    const el = mount({ onCancel });

    input(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );

    document.removeEventListener("keydown", onDocumentEscape);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDocumentEscape).not.toHaveBeenCalled();
  });

  it("keeps a click on its own buttons away from the row underneath", () => {
    // Inbox cards navigate on click and thread rows have their own handlers.
    const onOuter = vi.fn();
    const row = document.createElement("div");
    row.addEventListener("click", onOuter);
    document.body.appendChild(row);
    const el = mount();
    row.appendChild(el);

    click(cancel(el));
    expect(onOuter).not.toHaveBeenCalled();
  });
});

describe("confirmDiscard", () => {
  it("asks with the discard wording and resolves true when accepted", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const answer = confirmDiscard(host, en);
    await flush();

    expect(
      document.querySelector(`.${CLASSES.CONFIRM_TITLE}`).textContent
    ).toBe(en.confirmDiscardTitle);
    expect(
      document.querySelector(`.${CLASSES.CONFIRM_CANCEL}`).textContent
    ).toBe(en.confirmKeepEditing);

    click(document.querySelector(`.${CLASSES.CONFIRM_ACCEPT}`));
    expect(await answer).toBe(true);
  });

  it("resolves false when the user chooses to keep editing", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const answer = confirmDiscard(host, en);
    await flush();

    click(document.querySelector(`.${CLASSES.CONFIRM_CANCEL}`));
    expect(await answer).toBe(false);
  });
});
