# Testing HellDots

## Automated

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit (checkJs + index.d.ts consistency)
npm test              # Vitest (unit)
npm run test:coverage # Vitest + coverage gate (≥80%)
npm run build          # esbuild -> dist/
npm run size           # gzip budget gate (≤50 KB on dist/helldots.esm.js)
```

Chained (matches CI): `npm run lint && npm run typecheck && npm test && npm run test:coverage && npm run build && npm run size`

Lighthouse (accessibility/performance) runs against
`playground/lighthouse.html`, a minimal fixture kept separate from the
feature-rich `playground/index.html` demo — see `DECISIONS.md` for why.

## Manual keyboard navigation (WCAG 2.1 AA)

Verified 2026-07-01 against `playground/index.html` in a real Chromium
browser (Playwright), keyboard only unless noted:

| Step | Action                                   | Result                                                                                                                              |
| ---- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `Alt+C` (configurable shortcut)          | Comment mode toggles on; toolbar's Comment button reflects state via `aria-pressed="true"`                                          |
| 2    | Click to place a comment*                | Comment box opens, focus moves to the input                                                                                         |
| 3    | Type text, `Enter`                       | Comment saves; a circle marker renders; its thread popover opens automatically                                                      |
| 4    | `Tab` from the page body                 | Reaches the comment circle marker (`role="button"`, `tabindex="0"`) in normal tab order, crossing the shadow DOM boundary correctly |
| 5    | `Enter` (or `Space`) on a focused circle | Opens the thread popover, same as a click                                                                                           |
| 6    | Popover opens                            | Focus moves automatically to the reply input (`aria-label="Reply..."`)                                                              |
| 7    | Type a reply, `Enter`                    | Reply submits and renders in the thread                                                                                             |
| 8    | `Escape`                                 | Closes the thread popover; a second `Escape` (or from a bare comment box) exits comment mode                                        |
| 9    | `Escape` with a lightbox open            | Closes the lightbox first, before falling through to the popover/comment-mode checks                                                |

\* Placing a **new** comment requires pointing at a location on the host
page (click, or drag to attach a screenshot) — this is inherent to the
feature (anchoring a comment to an arbitrary spot on the host page) and is
consistent with comparable tools (Vercel Toolbar, Userback, Marker.io).
Every other interaction — activating an existing comment marker, replying,
closing tooltips/popovers/lightbox, dismissing the comment box, exiting
comment mode — is fully keyboard-operable.

Note: visible `:focus-visible` outlines were added here for the toolbar
buttons, comment input, reply input, and comment circles, then deliberately
reverted at the user's request to restore exact pixel parity with the
pre-Shadow-DOM UI (`dev-v2`) — see `DECISIONS.md`. Keyboard users
currently get no visible focus indicator on these elements, same as before
the accessibility pass; this is a known, intentional accessibility gap.

Re-run this checklist whenever `src/overlay.js` or `src/components.js`
change focus/keyboard-handling logic.
