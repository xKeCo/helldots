import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  checkCommitMessage,
  readConvention,
} from "../scripts/check-commit-msg.mjs";

const convention = readConvention();

describe("the commit convention table", () => {
  it("is read from CONTRIBUTING.md, not copied into the guard", () => {
    // The point of parsing the doc: editing the table there changes what the
    // hook accepts, with no second copy to keep in sync.
    const md = readFileSync(resolve("CONTRIBUTING.md"), "utf8");
    expect(readConvention(md).get("style")).toBe(":art:");
    expect(convention.get("style")).toBe(":art:");
  });

  it("covers every type the document lists", () => {
    expect([...convention.keys()].sort()).toEqual(
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "style",
        "test",
      ].sort()
    );
  });
});

describe("checkCommitMessage", () => {
  const ok = (message) => expect(checkCommitMessage(message)).toEqual([]);
  const rejects = (message, fragment) => {
    const problems = checkCommitMessage(message);
    expect(problems.join("\n")).toContain(fragment);
  };

  it("accepts the shapes CONTRIBUTING.md documents", () => {
    ok(":bug: fix(overlay): keep panels open over the lightbox");
    ok(":sparkles: feat: add reactions"); // scope omitted for repo-wide work
    ok(":memo: docs(reactions) A2-2106: document the API");
    ok(":art: style(reactions): tighten the action strip\n\nBody line.");
  });

  it("rejects the emoji this repo does not use for a type", () => {
    // The actual mistake this guard was written for: gitmoji's own convention
    // puts :lipstick: on UI work, while this repo's table says :art:.
    rejects(
      ":lipstick: style(reactions): tighten the action strip",
      'type "style" takes :art:, not :lipstick:'
    );
    rejects(":art: feat(inbox): add a filter", 'type "feat" takes :sparkles:');
  });

  it("rejects an unknown type", () => {
    rejects(
      ":sparkles: feature(inbox): add a filter",
      'unknown type "feature"'
    );
  });

  it("rejects a message that is not in the documented shape", () => {
    rejects("fix: no emoji at all", "does not match");
    rejects("just a sentence", "does not match");
    rejects(":bug: fix(overlay) missing the colon", "does not match");
  });

  it("rejects a subject that ends with a period or runs long", () => {
    rejects(":bug: fix(overlay): keep panels open.", "ends with a period");
    rejects(`:bug: fix(overlay): ${"x".repeat(80)}`, "keep it near 50–60");
  });

  it("ignores comment lines and leading blanks, reading the real subject", () => {
    ok("\n:bug: fix(overlay): keep panels open\n\n# please enter the message");
  });

  it("lets git's own messages through", () => {
    // Nobody authors these, and rejecting them breaks merges and rebases.
    ok("Merge branch 'dev' into feature/x");
    ok('Revert ":bug: fix(overlay): keep panels open"');
    ok("fixup! :bug: fix(overlay): keep panels open");
  });

  it("reports an empty message rather than passing it", () => {
    rejects("\n\n# only comments here", "empty");
  });
});
