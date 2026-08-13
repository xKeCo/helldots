# Contributing to HellDots

Everything written into this repo — docs, code comments, commit messages,
changesets, PR descriptions — is in English.

## Commit convention

Every commit follows this format:

```
<emoji> <type>(<scope>) <IssueID>: <subject>

<optional 1-2 line body>
```

Example:

```
:bug: fix(overlay): keep panels open over the lightbox, one menu at a time
```

### Type and emoji

Pick the type from the dominant nature of the change, and use the matching
[gitmoji](https://gitmoji.dev) shortcode — the literal `:code:`, not the
rendered character, so the message stays greppable and terminal-safe.

| Type       | Emoji code              | When to use it                       |
| ---------- | ----------------------- | ------------------------------------ |
| `feat`     | `:sparkles:`            | new feature                          |
| `fix`      | `:bug:`                 | bug fix                              |
| `docs`     | `:memo:`                | documentation                        |
| `refactor` | `:recycle:`             | refactor with no behavior change     |
| `build`    | `:construction_worker:` | build system, scripts, dependencies  |
| `test`     | `:white_check_mark:`    | adding or adjusting tests            |
| `ci`       | `:green_heart:`         | CI/CD                                |
| `style`    | `:art:`                 | formatting only, no logic change     |
| `perf`     | `:zap:`                 | backward-compatible perf improvement |
| `chore`    | `:wrench:`              | maintenance (config, tooling)        |

### Scope

A high-level area, not a literal file or folder name. In this repo that means
things like `overlay`, `inbox`, `capture`, `i18n`, `types`, `build`, `ci`,
`deps`. Omit the parentheses entirely when a change is genuinely repo-wide.

### Issue ID

Taken from the branch name when it carries one — a branch called
`A2-2106-redesign-login` yields `A2-2106`. **Omit the field when the branch
has no ID; never invent one.** The long-lived branches here (`main`, `dev`,
`staging`) carry none, so in practice this field is usually absent.

This field is for external trackers (Jira and the like). To reference a
**GitHub** issue, use the footer below instead — the two are independent.

### Subject and body

- Imperative mood ("add", not "added" or "adds"), no trailing period.
- Keep it to roughly 50–60 characters.
- The body is optional. Use it for _why_ the change was made, in one or two
  lines — not a restatement of the diff, which the diff already covers.

### Closing GitHub issues

When a commit resolves an issue, close it from the commit body:

```
:bug: fix(capture): paint the effective page background behind screenshots

DOM-based renders produce a transparent PNG when neither html nor body
paints a background, so captures were invisible over the dark inbox UI.

Closes #42
```

GitHub accepts `close`/`closes`/`closed`, `fix`/`fixes`/`fixed` and
`resolve`/`resolves`/`resolved`, and closes the issue when the commit lands on
the default branch.

### Scope of this convention

It applies to new commits. History before it is plain Conventional Commits
without an emoji and stays that way — nothing is rewritten.

There is no automated check: the convention lives in this document and is
enforced at review time.

## Versioning and changelog (changesets)

Semantic versioning and the `CHANGELOG.md` for the **package published to
npm** are automated with [changesets](https://github.com/changesets/changesets).

The root `CHANGELOG.md` (hand-maintained during the technical plan) and the
one changesets generates serve different purposes: the root one documents
architectural decisions while the library is being built; the generated one
documents real npm releases, version by version.

Workflow:

1. When making a change that should surface in a published version, run:

   ```bash
   npm run changeset
   ```

   It asks for the bump type (`patch`/`minor`/`major`) and a summary of the
   change, then writes a file into `.changeset/`.

2. Commit that file alongside the code change. CI enforces this on every PR
   (`changeset status` against the base branch); a PR that genuinely
   publishes nothing — docs, CI, playground — records that explicitly with an
   empty changeset:

   ```bash
   npx changeset --empty
   ```

3. When cutting a release, run:

   ```bash
   npm run release   # changeset version
   ```

   This consumes every pending changeset, updates `version` in `package.json`
   and appends the matching entry to `CHANGELOG.md`.

4. Commit the version bump, tag it (`git tag vX.Y.Z`) and push the tag —
   `.github/workflows/release.yml` triggers on `v*` tags (see `DECISIONS.md`
   for the state of that workflow).

## Before opening a PR

```bash
npm run verify
```

It chains every gate CI runs: lint → typecheck → format → test → build →
size.
