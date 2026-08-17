// Validates a commit message against the convention in CONTRIBUTING.md.
//
// The allowed type→emoji pairs are PARSED FROM THAT DOCUMENT at run time
// rather than copied here. A second copy is a second source of truth, and the
// two drift the moment someone edits one of them — which is exactly the class
// of mistake this guard exists to catch.
//
// Run by the commit-msg hook (see .githooks/), and directly in tests.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The type→emoji table from CONTRIBUTING.md, as a Map.
 * @param {string} [contributing] raw markdown, for tests
 * @returns {Map<string, string>}
 */
export const readConvention = (contributing) => {
  const md =
    contributing ?? readFileSync(resolve(REPO_ROOT, "CONTRIBUTING.md"), "utf8");
  const table = new Map();
  // | `feat` | `:sparkles:` | new feature |
  const row = /^\|\s*`([a-z]+)`\s*\|\s*`(:[a-z_]+:)`\s*\|/gm;
  for (const [, type, emoji] of md.matchAll(row)) table.set(type, emoji);
  return table;
};

// Commits git creates or replays on its own, which no author is writing.
const EXEMPT = /^(Merge|Revert|fixup!|squash!|Applied changes from)/;

const SUBJECT_CEILING = 72;

/**
 * @param {string} message the full commit message
 * @param {Map<string, string>} [convention]
 * @returns {string[]} one line per problem; empty means the message is fine
 */
export const checkCommitMessage = (message, convention = readConvention()) => {
  const subject = message
    .split("\n")
    .find((line) => line.trim() && !line.startsWith("#"));

  if (!subject) return ["the commit message is empty"];
  if (EXEMPT.test(subject)) return [];

  // <emoji> <type>(<scope>) <IssueID>: <subject>
  // Scope and issue id are both optional — see CONTRIBUTING.md.
  const shape =
    /^(?<emoji>:[a-z_]+:) (?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?: (?<issue>[A-Z0-9-]+))?: (?<text>.+)$/;
  const match = subject.match(shape);

  if (!match) {
    return [
      `"${subject}"`,
      "  does not match <emoji> <type>(<scope>) <IssueID>: <subject>",
      `  e.g. :bug: fix(overlay): keep panels open over the lightbox`,
    ];
  }

  const problems = [];
  const { emoji, type, text } = match.groups;
  const expected = convention.get(type);

  if (!expected) {
    problems.push(
      `unknown type "${type}" — CONTRIBUTING.md allows: ${[...convention.keys()].join(", ")}`
    );
  } else if (emoji !== expected) {
    problems.push(
      `type "${type}" takes ${expected}, not ${emoji} (CONTRIBUTING.md, "Type and emoji")`
    );
  }

  if (text.endsWith(".")) problems.push("the subject ends with a period");
  if (text.length > SUBJECT_CEILING) {
    problems.push(
      `the subject is ${text.length} chars; keep it near 50–60, ${SUBJECT_CEILING} is the ceiling`
    );
  }

  return problems;
};

// --- hook entry point -------------------------------------------------------

const [, , messageFile] = process.argv;
if (messageFile) {
  const problems = checkCommitMessage(readFileSync(messageFile, "utf8"));
  if (problems.length > 0) {
    console.error("\nCommit message rejected:\n");
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('\nSee CONTRIBUTING.md, "Commit convention".\n');
    process.exit(1);
  }
}
