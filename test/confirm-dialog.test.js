import { describe, it, expect, afterEach, vi } from "vitest";
import {
  confirmDialog,
  closeOpenConfirmDialogs,
} from "../src/confirm-dialog.js";
import { CLASSES, Z_INDEX } from "../src/constants.js";

const STRINGS = {
  title: "Delete this comment?",
  message: "This cannot be undone.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
};

afterEach(() => {
  closeOpenConfirmDialogs();
  document.body.innerHTML = "";
});

const open = (host = document.body, strings = STRINGS) =>
  confirmDialog(host, strings);

const panelIn = (root = document) => root.querySelector(`.${CLASSES.CONFIRM}`);

const click = (el) =>
  el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const press = (key, init = {}) =>
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...init })
  );

describe("confirmDialog", () => {
  it("announces the message through aria-describedby", () => {
    // aria-labelledby carries only the title; the actual "cannot be
    // undone" consequence lives in the message and some AT won't read it
    // without describedby.
    open();
    const panel = panelIn().querySelector(`.${CLASSES.CONFIRM_PANEL}`);
    const message = panelIn().querySelector(`.${CLASSES.CONFIRM_MESSAGE}`);
    expect(message.id).toBeTruthy();
    expect(panel.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("renders the supplied copy and sits above the lightbox", () => {
    open();
    const backdrop = panelIn();
    expect(
      backdrop.querySelector(`.${CLASSES.CONFIRM_TITLE}`).textContent
    ).toBe(STRINGS.title);
    expect(
      backdrop.querySelector(`.${CLASSES.CONFIRM_MESSAGE}`).textContent
    ).toBe(STRINGS.message);
    expect(
      backdrop.querySelector(`.${CLASSES.CONFIRM_ACCEPT}`).textContent
    ).toBe(STRINGS.confirmLabel);
    // A screenshot can be open full-screen when the ⋯ behind it is used.
    expect(Number(backdrop.style.zIndex)).toBeGreaterThan(Z_INDEX.LIGHTBOX);
  });

  it("resolves true on confirm and removes itself", async () => {
    const answer = open();
    click(document.querySelector(`.${CLASSES.CONFIRM_ACCEPT}`));
    expect(await answer).toBe(true);
    expect(panelIn()).toBeNull();
  });

  it("resolves false on cancel", async () => {
    const answer = open();
    click(document.querySelector(`.${CLASSES.CONFIRM_CANCEL}`));
    expect(await answer).toBe(false);
  });

  it("cancels on Escape without letting it reach the page behind", async () => {
    const onKeydown = vi.fn();
    document.addEventListener("keydown", onKeydown);
    const answer = open();

    press("Escape");
    expect(await answer).toBe(false);

    document.removeEventListener("keydown", onKeydown);
    expect(onKeydown).not.toHaveBeenCalled();
  });

  it("cancels on a click that both starts and ends on the backdrop", async () => {
    const answer = open();
    const backdrop = panelIn();
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    click(backdrop);
    expect(await answer).toBe(false);
  });

  it("ignores a drag that starts inside the panel and ends on the backdrop", async () => {
    open();
    const backdrop = panelIn();
    backdrop
      .querySelector(`.${CLASSES.CONFIRM_PANEL}`)
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    click(backdrop);
    expect(panelIn()).toBeTruthy();
  });

  it("keeps the mousedown to itself, so the panels behind do not close", () => {
    const onMousedown = vi.fn();
    document.addEventListener("mousedown", onMousedown);
    open();
    panelIn().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    document.removeEventListener("mousedown", onMousedown);
    expect(onMousedown).not.toHaveBeenCalled();
  });

  it("focuses cancel, not the destructive button", () => {
    open();
    expect(document.activeElement).toBe(
      document.querySelector(`.${CLASSES.CONFIRM_CANCEL}`)
    );
  });

  it("restores focus to whatever had it before", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    const answer = open();
    click(document.querySelector(`.${CLASSES.CONFIRM_CANCEL}`));
    await answer;

    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab between the two buttons", () => {
    open();
    const cancel = document.querySelector(`.${CLASSES.CONFIRM_CANCEL}`);
    const accept = document.querySelector(`.${CLASSES.CONFIRM_ACCEPT}`);

    press("Tab");
    expect(document.activeElement).toBe(accept);
    press("Tab");
    expect(document.activeElement).toBe(cancel);
    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(accept);
  });

  it("mounts inside a shadow root when given one", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    open(root);
    expect(panelIn(root)).toBeTruthy();
    expect(panelIn()).toBeNull();
  });

  it("closeOpenConfirmDialogs settles pending answers and stops eating Escape", async () => {
    const answer = open();
    closeOpenConfirmDialogs();
    expect(await answer).toBe(false);
    expect(panelIn()).toBeNull();

    const onKeydown = vi.fn();
    document.addEventListener("keydown", onKeydown);
    press("Escape");
    document.removeEventListener("keydown", onKeydown);
    expect(onKeydown).toHaveBeenCalled();
  });
});
