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
purpose. It is also a **peer dependency** (mirrored in `devDependencies` for
the local build) so external scanners — Bundlephobia, bundlejs — attribute
it to its own package instead of counting it against this budget, and it is
**lazy-loaded** (`import()` on first capture in `src/capture.js`) so hosts
never pay for it in their initial bundle. Keep both properties.

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
(WCAG 1.4.1). The Lighthouse a11y gate in CI sits at 0.9.

Focus indicators are bound to **`:focus-visible`, never `:focus`** — that
distinction is the whole reason they exist again after having been reverted
once for visual parity (`DECISIONS.md`). A `:focus` rule fires on a mouse
click too, which is what broke the look the first time. Two consequences to
keep in mind when touching `styles.js`:

- The indicator block has to stay **last in `getStyles()`**. `:focus-visible`
  is a subset of `:focus`, so both rules match at once and the suppressors
  above it are equally specific — source order is the only thing that makes
  the indicator win.
- The selector is `[tabindex="0"]`, not `[tabindex]`. The inbox panel is
  `tabindex="-1"` and its ring is suppressed on purpose.

Text fields take an inset underline rather than the ring, because browsers
match `:focus-visible` on them even on a click. `styles.test.js` guards all
of it — a second revert fails the build instead of passing quietly.

What Lighthouse cannot see, it cannot gate: 2.4.7 is not machine-detectable
and the score reads 100 either way. Keyboard focus still ships one known
limitation — no focus containment on the modal surfaces — recorded in
`DECISIONS.md`.

## Running the playground

```bash
npm run dev   # then open http://localhost:4173/playground
```

The playground imports `src/` directly through native ES modules, so it needs
to be served over HTTP — opening the file over `file://` will not work.
