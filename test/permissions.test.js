import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import CommentOverlay from "../src/overlay.js";
import { TAG_NAME } from "../src/root-element.js";
import {
  resolvePermission,
  isOwnRecord,
  commentTargetOf,
  replyTargetOf,
  PERMISSION_ACTIONS,
} from "../src/permissions.js";
import { createCommentActions } from "../src/comment-actions.js";
import { createReplyElement } from "../src/components.js";
import { CLASSES } from "../src/constants.js";
import en from "../src/locales/en.js";

vi.mock("../src/capture.js", () => ({
  renderPage: vi.fn().mockResolvedValue({ width: 0, height: 0 }),
  cropRegion: vi.fn().mockReturnValue("data:image/png;base64,mocked"),
  cropViewport: vi.fn().mockReturnValue("data:image/jpeg;base64,mocked"),
  withHiddenOverlay: vi.fn((fn) => fn()),
  AUTO_SCALE: 0.5,
}));

const strings = { anonymous: en.anonymous };

describe("the default ownership rule", () => {
  it("recognises a record carrying the actor's id", () => {
    const target = { id: 1, author: "Kevin", authorId: "u_42" };
    expect(isOwnRecord(target, { name: "Kevin", id: "u_42" }, strings)).toBe(
      true
    );
  });

  it("refuses a record carrying somebody else's id", () => {
    const target = { id: 1, author: "Ana", authorId: "u_7" };
    expect(isOwnRecord(target, { name: "Kevin", id: "u_42" }, strings)).toBe(
      false
    );
  });

  // Two teammates sharing a display name are the reason `user.id` exists;
  // without ids the widget genuinely cannot tell them apart, and the rule
  // says so by falling back to the name rather than pretending otherwise.
  it("falls back to the display name when no ids are present", () => {
    const mine = { id: 1, author: "Kevin", authorId: null };
    const theirs = { id: 2, author: "Ana", authorId: null };
    expect(isOwnRecord(mine, { name: "Kevin" }, strings)).toBe(true);
    expect(isOwnRecord(theirs, { name: "Kevin" }, strings)).toBe(false);
  });

  // The compatibility guarantee: a host that never declared a user must see
  // exactly the widget it saw before this rule existed.
  it("treats an unidentified host as the author of everything", () => {
    const target = { id: 1, author: en.anonymous, authorId: null };
    expect(isOwnRecord(target, undefined, strings)).toBe(true);
  });

  // An id beats a name on both sides: the same person under a renamed
  // account keeps their own comments.
  it("prefers the id over the name when both are present", () => {
    const target = { id: 1, author: "Kevin C.", authorId: "u_42" };
    expect(isOwnRecord(target, { name: "Kevin", id: "u_42" }, strings)).toBe(
      true
    );
  });
});

describe("resolvePermission", () => {
  const target = { id: 1, author: "Ana", authorId: "u_7" };
  const user = { name: "Kevin", id: "u_42" };

  it("hands the action and the target to the host's can", () => {
    const can = vi.fn().mockReturnValue(true);
    resolvePermission({ can, action: "delete:comment", target, user, strings });
    expect(can).toHaveBeenCalledWith("delete:comment", target);
  });

  it("lets the host allow what the default rule would refuse", () => {
    const allowed = resolvePermission({
      can: () => true,
      action: "delete:comment",
      target,
      user,
      strings,
    });
    expect(allowed).toBe(true);
  });

  it("lets the host refuse what the default rule would allow", () => {
    const allowed = resolvePermission({
      can: () => false,
      action: "delete:comment",
      target: { id: 1, author: "Kevin", authorId: "u_42" },
      user,
      strings,
    });
    expect(allowed).toBe(false);
  });

  // Fail closed. A branch with no return is a host bug, and answering "yes"
  // to it would reopen the very hole the module closes.
  it.each([
    ["undefined", undefined],
    ["a truthy non-boolean", "yes"],
    ["null", null],
    ["1", 1],
  ])("denies when can returns %s", (_label, value) => {
    const allowed = resolvePermission({
      can: () => value,
      action: "delete:comment",
      target,
      user,
      strings,
    });
    expect(allowed).toBe(false);
  });

  it("denies and warns when can throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const allowed = resolvePermission({
      can: () => {
        throw new Error("boom");
      },
      action: "delete:comment",
      target,
      user,
      strings,
    });
    expect(allowed).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to the default rule when can is not a function", () => {
    for (const can of [undefined, null, true, "always"]) {
      expect(
        resolvePermission({
          can,
          action: "delete:comment",
          target,
          user,
          strings,
        })
      ).toBe(false);
    }
  });
});

describe("permission targets", () => {
  it("carries identity and nothing heavier", () => {
    const target = commentTargetOf({
      id: 1,
      author: "Kevin",
      authorId: "u_42",
      text: "hola",
      screenshots: ["data:image/png;base64,huge"],
    });
    expect(target).toEqual({ id: 1, author: "Kevin", authorId: "u_42" });
  });

  it("normalises a missing authorId to null", () => {
    expect(commentTargetOf({ id: 1, author: "Kevin" }).authorId).toBe(null);
  });

  it("names the parent comment on a reply target", () => {
    const target = replyTargetOf(
      { id: "r1", author: "Ana", authorId: "u_7" },
      "c1"
    );
    expect(target).toEqual({
      id: "r1",
      author: "Ana",
      authorId: "u_7",
      commentId: "c1",
    });
  });
});

describe("the guarded mutators", () => {
  let overlay;

  const cleanupDom = () => {
    document.querySelectorAll(TAG_NAME).forEach((el) => el.remove());
    document.body.innerHTML = "";
  };

  // A comment somebody else wrote, arriving the way a host's backend
  // delivers one.
  const loadForeignComment = (over = {}) => {
    overlay.loadComments([
      {
        id: "c1",
        text: "Ana's comment",
        anchor: null,
        page: location.pathname,
        author: "Ana",
        authorId: "u_7",
        createdAt: new Date().toISOString(),
        replies: [
          {
            id: "r1",
            text: "Ana's reply",
            author: "Ana",
            authorId: "u_7",
            timestamp: new Date().toISOString(),
          },
        ],
        ...over,
      },
    ]);
    return overlay.comments[0];
  };

  beforeEach(() => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = `<section id="target">Compare our plans</section>`;
    overlay = new CommentOverlay({ user: { name: "Kevin", id: "u_42" } });
  });

  afterEach(() => {
    overlay?.cleanup?.();
    cleanupDom();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  // `_asUser` is what the inbox and the popover route every click through,
  // so it is what "somebody clicked Delete in the widget" means here.
  const asUser = (fn) => overlay._asUser(fn);

  it("refuses a click that would delete somebody else's comment", () => {
    loadForeignComment();
    expect(asUser(() => overlay.deleteComment("c1"))).toBe(false);
    expect(overlay.comments).toHaveLength(1);
  });

  it("refuses a click that would edit somebody else's comment", () => {
    const comment = loadForeignComment();
    expect(asUser(() => overlay.editComment("c1", "rewritten"))).toBe(false);
    expect(comment.text).toBe("Ana's comment");
    expect(comment.editedAt).toBeFalsy();
  });

  it("refuses a click that would delete somebody else's reply", () => {
    const comment = loadForeignComment();
    expect(asUser(() => overlay.deleteReply("c1", "r1"))).toBe(false);
    expect(comment.replies).toHaveLength(1);
  });

  it("refuses a click that would edit somebody else's reply", () => {
    const comment = loadForeignComment();
    expect(asUser(() => overlay.editReply("c1", "r1", "rewritten"))).toBe(
      false
    );
    expect(comment.replies[0].text).toBe("Ana's reply");
  });

  it("emits nothing when it refuses", () => {
    const onChange = vi.fn();
    // Wired after the load: loadComments reports its own anchor-lost event,
    // and that is the host's business, not a refusal leaking out.
    loadForeignComment();
    overlay.options.onChange = onChange;
    asUser(() => overlay.deleteComment("c1"));
    asUser(() => overlay.editComment("c1", "rewritten"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("allows a click on the actor's own comment", () => {
    loadForeignComment({ author: "Kevin", authorId: "u_42" });
    expect(asUser(() => overlay.deleteComment("c1"))).toBe(true);
    expect(overlay.comments).toHaveLength(0);
  });

  // The host outranks the rule: its backend has already decided.
  it("never refuses the host's own call", () => {
    loadForeignComment();
    expect(overlay.deleteComment("c1")).toBe(true);
    expect(overlay.comments).toHaveLength(0);
  });

  it("never refuses the host's own call even under a can that denies all", () => {
    overlay.options.can = () => false;
    loadForeignComment();
    expect(overlay.editComment("c1", "rewritten")).toBe(true);
    expect(overlay.deleteComment("c1")).toBe(true);
  });

  it("consults the host's can instead of the default rule", () => {
    overlay.options.can = (action) => action === "delete:comment";
    loadForeignComment();
    expect(asUser(() => overlay.editComment("c1", "rewritten"))).toBe(false);
    expect(asUser(() => overlay.deleteComment("c1"))).toBe(true);
  });

  it("leaves a host that declared no user with the widget it had", () => {
    overlay.cleanup();
    overlay = new CommentOverlay();
    loadForeignComment({ author: en.anonymous, authorId: null });
    expect(asUser(() => overlay.deleteComment("c1"))).toBe(true);
  });

  it("answers the same question through the public can()", () => {
    const comment = loadForeignComment();
    expect(overlay.can("delete:comment", commentTargetOf(comment))).toBe(false);
    expect(
      overlay.can("delete:reply", replyTargetOf(comment.replies[0], comment.id))
    ).toBe(false);
  });

  it("hands can() the actor set by setUser, not the one it mounted with", () => {
    const comment = loadForeignComment();
    const target = commentTargetOf(comment);
    expect(overlay.can("delete:comment", target)).toBe(false);
    overlay.setUser({ name: "Ana", id: "u_7" });
    expect(overlay.can("delete:comment", target)).toBe(true);
  });

  // Triage stays shared: a teammate has to be able to resolve and classify
  // a report they did not file.
  it("leaves classification, reactions and replying open", () => {
    loadForeignComment();
    expect(asUser(() => overlay.setCommentStatus("c1", "resolved"))).toBe(true);
    expect(asUser(() => overlay.setCommentType("c1", "bug"))).toBe(true);
    expect(asUser(() => overlay.setCommentPriority("c1", "high"))).toBe(true);
    expect(asUser(() => overlay.toggleCommentReaction("c1", "👍"))).toBe(true);
    expect(asUser(() => overlay.addReply("c1", "on it"))).not.toBe(null);
  });
});

describe("the menus a denied actor sees", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const labels = (root) =>
    [
      ...root.querySelectorAll(
        `.${CLASSES.INBOX_MENU_ITEM}:not([data-picker-option])`
      ),
    ].map((el) => el.textContent);

  const mountActions = (can) => {
    const el = createCommentActions(
      { id: "c1", text: "hola", status: "open", author: "Ana" },
      {
        strings: en,
        can,
        onCopy: vi.fn(),
        onSetStatus: vi.fn(),
        onDelete: vi.fn(),
      }
    );
    document.body.appendChild(el);
    return el;
  };

  it("drops Edit and Delete but keeps Copy link", () => {
    expect(labels(mountActions(() => false))).toEqual([en.copyLink]);
  });

  it("keeps the whole menu for an allowed actor", () => {
    expect(labels(mountActions(() => true))).toEqual([
      en.copyLink,
      en.editComment,
      en.deleteComment,
    ]);
  });

  it("keeps the whole menu when no policy is wired at all", () => {
    expect(labels(mountActions(undefined))).toEqual([
      en.copyLink,
      en.editComment,
      en.deleteComment,
    ]);
  });

  it("drops one item without dropping the other", () => {
    const el = mountActions((action) => action !== "delete:comment");
    expect(labels(el)).toEqual([en.copyLink, en.editComment]);
  });

  it("leaves a denied reply row with no ⋯ menu", () => {
    const el = createReplyElement(
      { id: "r1", text: "hola", author: "Ana", timestamp: "2026-01-01" },
      en,
      "en",
      {
        onDelete: vi.fn(),
        onEdit: vi.fn(),
        commentId: "c1",
        can: () => false,
      }
    );
    document.body.appendChild(el);
    expect(labels(el)).toEqual([]);
    expect(el.querySelector('[data-action="menu"]')).toBe(null);
  });

  it("gives an allowed reply row both of its items", () => {
    const el = createReplyElement(
      { id: "r1", text: "hola", author: "Kevin", timestamp: "2026-01-01" },
      en,
      "en",
      {
        onDelete: vi.fn(),
        onEdit: vi.fn(),
        commentId: "c1",
        can: () => true,
      }
    );
    document.body.appendChild(el);
    expect(labels(el)).toEqual([en.editReply, en.deleteReply]);
  });

  it("tells can which reply it is deciding about", () => {
    const can = vi.fn().mockReturnValue(true);
    createReplyElement(
      {
        id: "r1",
        text: "hola",
        author: "Ana",
        authorId: "u_7",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      en,
      "en",
      { onDelete: vi.fn(), onEdit: vi.fn(), commentId: "c1", can }
    );
    expect(can).toHaveBeenCalledWith("edit:reply", {
      id: "r1",
      author: "Ana",
      authorId: "u_7",
      commentId: "c1",
    });
  });
});

describe("PERMISSION_ACTIONS", () => {
  it("is the exact set the widget asks about", () => {
    expect(PERMISSION_ACTIONS).toEqual([
      "edit:comment",
      "delete:comment",
      "edit:reply",
      "delete:reply",
    ]);
  });
});
