# HellDots — working rules

HellDots is a framework-agnostic comment overlay published to npm. It ships as
ES modules with a self-contained UMD build for plain `<script>` usage, and its
UI lives inside a Shadow DOM so nothing leaks in either direction.

These rules are not aspirational — each one is already enforced by a gate in
this repo. They are written down so they do not have to be rediscovered by
reading the code.

## Language

Everything written into the repo is in **English**: docs, code comments,
identifiers, commit messages, changesets, PR text. No exceptions.

## Commits

Follow the format in `CONTRIBUTING.md`:
`<emoji> <type>(<scope>) <IssueID>: <subject>`, using the gitmoji shortcode
(`:bug:`, not 🐛). When the change closes a GitHub issue, add `Closes #N` in
the body.

**Never fill the emoji in from memory.** This repo's table is not gitmoji's
general convention — most notably `style` is `:art:` here, while gitmoji puts
`:lipstick:` on UI work. The table is the contract:

| `feat` `:sparkles:` | `fix` `:bug:` | `docs` `:memo:` | `refactor` `:recycle:` | `build` `:construction_worker:` |
| `test` `:white_check_mark:` | `ci` `:green_heart:` | `style` `:art:` | `perf` `:zap:` | `chore` `:wrench:` |

A `commit-msg` hook rejects a mismatch, and it reads the table straight out of
`CONTRIBUTING.md` — so that document stays the single source of truth. Pick
the type from the dominant nature of the change: `style` means presentation
only, so a commit that also changes behaviour is not `style`.

## Verification before claiming completion

`npm run verify` chains every gate: lint → typecheck → format → test → build →
size. Run it before calling work done. Never state that something passes
without having run it and read the output — if a gate fails, say so with the
output.

## i18n is mandatory

Every user-visible string goes into **both** `src/locales/en.js` and
`src/locales/es.js`. Never a literal in the UI. A regression test scans
`src/components.js` for hardcoded English and fails the build.

## Size budget

`npm run size` gates `dist/helldots.esm.js` at 50 KB gzip. New dependencies
are weighed against it: `modern-screenshot` is `external` in the ESM bundle
and only bundled into the UMD artifact, which sits outside the budget on
purpose.

## Types are a gate

`npm run typecheck` runs `tsc --noEmit` over JS with `checkJs`. Every new
public method must be declared in `src/index.d.ts`, or
`typecheck/consistency-check.ts` stops compiling. That file exists because
TypeScript silently stops checking a `.js` when a sibling `.d.ts` is present —
see `DECISIONS.md`.

## Changesets

Any change that affects the published package needs a changeset
(`npm run changeset`), committed alongside the code.

## Record decisions

When a choice had more than one defensible option, add an entry to
`DECISIONS.md` explaining the reasoning and any limitation it accepts. It is a
living log: a reversed decision gets a new entry rather than the old one being
deleted.

## Accessibility

No badge communicates meaning through color alone — every one carries text
(WCAG 1.4.1). The Lighthouse a11y gate in CI sits at 0.9. Note that the
widget currently ships a **known, intentional** gap: visible focus rings were
deliberately reverted for visual parity — documented in `DECISIONS.md`, do not
"fix" it without asking.

## Running the playground

```bash
npm run dev   # then open http://localhost:4173/playground
```

The playground imports `src/` directly through native ES modules, so it needs
to be served over HTTP — opening the file over `file://` will not work.
