import {
  CLASSES,
  IDS,
  Z_INDEX,
  CURSOR_SVG,
  CURSOR_HOTSPOT,
  MARKER_SIZE,
} from "./constants.js";

// Every scrollable surface in the widget sits on a #1C1C1E panel, so the
// scrollbar has to be dark too. It was not: Chromium >= 121 ignores all
// ::-webkit-scrollbar-* rules on an element that also declares
// scrollbar-width or scrollbar-color, so the popover's styled thumb was
// dropped and the platform default took over — a light thumb on a white
// track, painted straight over the panel.
//
// The standard properties are the ones that win there, so they carry the
// colour. The webkit block stays for Safari, which only shipped
// scrollbar-color in 18.2 and still needs the pseudo-elements before that.
const SCROLLBAR = `
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.22) transparent;`;

const webkitScrollbar = (...selectors) =>
  selectors
    .map(
      (selector) => `
    ${selector}::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }

    ${selector}::-webkit-scrollbar-track {
        background: transparent;
    }

    ${selector}::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.22);
        border-radius: 4px;
    }

    ${selector}::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.35);
    }
`
    )
    .join("");

export const getStyles = () => `

    :host {
        all: initial;
        display: block;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        line-height: 1.5;
        color-scheme: light;
    }

    :host *,
    :host *::before,
    :host *::after {
        box-sizing: border-box;
        font-family: inherit;
    }

    button {
        padding: 0;
        font: inherit;
        color: inherit;
    }

    #${IDS.TOOLBAR} {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: ${Z_INDEX.TOOLBAR};
    }

    .${CLASSES.TOOLBAR_ACTION_WRAPPER} {
        position: relative;
    }

    .${CLASSES.TOOLBAR_ACTION_TOOLTIP} {
        position: absolute;
        bottom: calc(100% + 10px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(20, 20, 23, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
        color: white;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease, transform 0.15s ease;
    }

    .${CLASSES.TOOLBAR_ACTION_WRAPPER}:hover .${
      CLASSES.TOOLBAR_ACTION_TOOLTIP
    } {
        opacity: 1;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0);
    }

    .${CLASSES.TOOLBAR_TEXT} {
        font-size: 13px;
        font-weight: 500;
        letter-spacing: -0.01em;
    }

    .${CLASSES.SHORTCUT_HINT} {
        font-size: 11px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.5);
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 5px;
        line-height: 1;
        white-space: nowrap;
    }

    .${CLASSES.TOOLBAR_ACTIONS} {
        display: flex;
        flex-direction: row;
        background: rgba(20, 20, 23, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
    }

    .${CLASSES.TOOLBAR_ACTION_BTN} {
        width: 42px;
        height: 42px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        outline: none;
        color: rgba(255, 255, 255, 0.65);
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
        padding: 0;
    }

    .${CLASSES.TOOLBAR_ACTION_WRAPPER}:first-child .${
      CLASSES.TOOLBAR_ACTION_BTN
    } {
        border-radius: 12px 0 0 12px;
    }

    .${CLASSES.TOOLBAR_ACTION_WRAPPER}:last-child .${
      CLASSES.TOOLBAR_ACTION_BTN
    } {
        border-radius: 0 12px 12px 0;
    }

    .${CLASSES.TOOLBAR_ACTION_BTN}:hover {
        background: rgba(255, 255, 255, 0.08);
        color: white;
    }

    .${CLASSES.TOOLBAR_COMMENT_BTN}.${CLASSES.ACTIVE} {
        color: #2E90FA;
        background: rgba(46, 144, 250, 0.1);
    }

    
    #${IDS.COMMENT_BOX} {
        position: fixed;
        background: #1C1C1E;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        padding: 16px;
        z-index: ${Z_INDEX.COMMENT_BOX};
        width: min(400px, calc(100vw - 24px));
        display: none;
        box-sizing: border-box;
    }

    #${IDS.COMMENT_BOX} .${CLASSES.COMMENT_INPUT_AREA} {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    /* Shares the comment box's own 16px inset instead of adding its own, so
       the pickers line up with the textarea below them. The hairline is the
       mirror of the one .thread-input-area carries on top. */
    .${CLASSES.CLASSIFY_ROW} {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 0 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* In the inbox the pickers sit in a strip of other icon buttons and read
       as controls on their own. Alone at the top of an empty comment box
       they need an outline to do the same. */
    .${CLASSES.CLASSIFY_ROW} .${CLASSES.INBOX_ACTION_BTN} {
        height: 26px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
    }

    .${CLASSES.CLASSIFY_ROW} .${CLASSES.INBOX_ACTION_BTN}:hover {
        border-color: rgba(255, 255, 255, 0.28);
    }

    #${IDS.COMMENT_INPUT} {
        flex: 1;
        min-height: 20px;
        background: #1C1C1E;
        border: none;
        resize: none;
        font-family: inherit;
        color: white;
        font-size: 14px;
        line-height: 1.4;
        box-sizing: border-box;
        field-sizing: content;
        padding: 8px 0;
    }

    #${IDS.COMMENT_INPUT}::placeholder {
        color: rgba(255, 255, 255, 0.5);
    }
    
    #${IDS.COMMENT_INPUT}:focus {
        outline: none;
        box-shadow: none;
    }

    .${CLASSES.COMMENT_ACTIONS_BAR} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 12px;
    }

    .${CLASSES.ATTACH_IMAGE_BTN} {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: background 0.2s, color 0.2s;
    }

    .${CLASSES.ATTACH_IMAGE_BTN}:hover {
        background: rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.8);
    }

    .${CLASSES.CIRCLE} {
        position: absolute;
        width: ${MARKER_SIZE}px;
        height: ${MARKER_SIZE}px;
        background: #2E90FA;
        border-radius: 0% 100% 100% 100%;
        border: 2px solid #FFF;
        cursor: pointer;
        box-shadow: 0 1px 5px rgba(0,0,0,0.2);
        transition: transform 0.2s, background 0.2s;
        z-index: ${Z_INDEX.CIRCLE};
        transform: translate(-50%, -50%);
    }

    .${CLASSES.CIRCLE}:hover {
        transform: translate(-50%, -50%) scale(1.2) !important;
        background: rgb(0, 123, 255);
    }

    .${CLASSES.CIRCLE}.${CLASSES.HIGHLIGHT} {
        transform: translate(-50%, -50%) scale(1.2) !important;
        background: rgb(0, 123, 255);
        box-shadow: 0 0 0 4px rgba(46, 144, 250, 0.35), 0 1px 5px rgba(0,0,0,0.2);
    }

    /* The marker whose thread is open. Grows like hover does — the pointer
       has to leave the circle to reach the popover, so hover alone can't
       carry the selected state — and adds a heavier ring. Size and ring,
       not colour alone (WCAG 1.4.1). */
    .${CLASSES.CIRCLE}.${CLASSES.CIRCLE_ACTIVE} {
        transform: translate(-50%, -50%) scale(1.2) !important;
        background: rgb(0, 123, 255);
        box-shadow: 0 0 0 5px rgba(46, 144, 250, 0.5), 0 1px 5px rgba(0,0,0,0.2);
    }

    .${CLASSES.TOOLTIP} {
        position: fixed;
        background: #1C1C1E;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        width: min(400px, calc(100vw - 24px));
        max-height: calc(100vh - 20px);
        overflow-y: auto;
        overscroll-behavior: contain;${SCROLLBAR}
        z-index: ${Z_INDEX.TOOLTIP};
        color: white;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
    }

    .${CLASSES.TOOLTIP} .${CLASSES.THREAD_BODY} {
        padding: 8px 0;
    }

    .${CLASSES.THREAD_POPOVER} {
        position: fixed;
        background: #1C1C1E;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        width: min(400px, calc(100vw - 24px));
        max-height: calc(100vh - 20px);
        display: flex;
        flex-direction: column;
        z-index: ${Z_INDEX.TOOLTIP};
        color: white;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
    }

    /* The header, its action row and the reply box are pinned; the comment
       body, context block and replies scroll between them. The min-height: 0
       is required — a flex item's default minimum is its content height, so
       without it the popover grows past max-height instead of scrolling. */
    .${CLASSES.THREAD_POPOVER} > .${CLASSES.THREAD_HEADER},
    .${CLASSES.THREAD_POPOVER} > .${CLASSES.THREAD_ACTIONS_ROW},
    .${CLASSES.THREAD_POPOVER} > .${CLASSES.THREAD_INPUT_AREA} {
        flex: none;
    }

    .${CLASSES.THREAD_SCROLL} {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        overscroll-behavior: contain;${SCROLLBAR}
    }
${webkitScrollbar(
  `.${CLASSES.THREAD_SCROLL}`,
  `.${CLASSES.TOOLTIP}`,
  `.${CLASSES.INBOX_LIST}`,
  `.${CLASSES.INBOX_DETAIL}`,
  `.${CLASSES.EDITOR_INPUT}`
)}
    .${CLASSES.INBOX_PANEL} {
        position: fixed;
        top: 16px;
        right: 16px;
        bottom: 16px;
        width: 380px;
        display: flex;
        flex-direction: column;
        background: #1C1C1E;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: ${Z_INDEX.COMMENT_BOX};
        color: white;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
        overflow: hidden;
    }

    /* 380px panel + 16px of gutter each side needs 412px to sit flush on
       the right; below that it spans the viewport instead. */
    @media (max-width: 480px) {
        .${CLASSES.INBOX_PANEL} {
            left: 16px;
            width: auto;
        }
    }

    .${CLASSES.INBOX_HEADER},
    .${CLASSES.INBOX_DETAIL_HEADER} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex: none;
    }

    .${CLASSES.INBOX_FILTER}-wrapper {
        position: relative;
    }

    .${CLASSES.INBOX_FILTER} {
        display: flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: none;
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 6px;
    }

    .${CLASSES.INBOX_FILTER}:hover {
        background: rgba(255,255,255,0.08);
    }

    .${CLASSES.INBOX_FILTER_MENU} {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        background: #2C2C2E;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 14px;
        width: 300px;
        max-width: calc(100vw - 40px);
        z-index: 1;
        box-shadow: 0 8px 28px rgba(0,0,0,0.5);
    }

    .${CLASSES.INBOX_FILTER_MENU_HEADER} {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 12px;
    }

    .${CLASSES.INBOX_FILTER_CLEAR} {
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.55);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        padding: 0;
    }

    .${CLASSES.INBOX_FILTER_CLEAR}:hover:not(:disabled) {
        color: white;
    }

    .${CLASSES.INBOX_FILTER_CLEAR}:disabled {
        opacity: 0.35;
        cursor: default;
    }

    .${CLASSES.INBOX_FILTER_GROUP} + .${CLASSES.INBOX_FILTER_GROUP} {
        margin-top: 14px;
    }

    .${CLASSES.INBOX_FILTER_SECTION} {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255,255,255,0.45);
        margin-bottom: 8px;
    }

    .${CLASSES.INBOX_FILTER_CHIPS} {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .${CLASSES.INBOX_FILTER_CHIP} {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 999px;
        color: rgba(255,255,255,0.75);
        font-size: 12px;
        line-height: 1;
        padding: 7px 12px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
    }

    .${CLASSES.INBOX_FILTER_CHIP}:hover {
        border-color: rgba(255,255,255,0.4);
        color: white;
    }

    /* Selected chips are filled *and* carry aria-checked — the fill is a
       convenience, never the only way to tell them apart. */
    .${CLASSES.INBOX_FILTER_CHIP}[aria-checked="true"] {
        background: rgba(255,255,255,0.92);
        border-color: rgba(255,255,255,0.92);
        color: #1C1C1E;
        font-weight: 600;
    }

    .${CLASSES.INBOX_MENU_ITEM} {
        display: block;
        width: 100%;
        text-align: left;
        background: transparent;
        border: none;
        color: white;
        font-size: 13px;
        padding: 7px 10px;
        border-radius: 6px;
        cursor: pointer;
    }

    .${CLASSES.INBOX_MENU_ITEM}:hover {
        background: rgba(255,255,255,0.08);
    }

    .${CLASSES.INBOX_CLOSE},
    .${CLASSES.INBOX_NAV_BTN},
    .${CLASSES.INBOX_BACK} {
        display: flex;
        align-items: center;
        gap: 4px;
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.75);
        cursor: pointer;
        padding: 4px 6px;
        border-radius: 6px;
        font-size: 14px;
    }

    .${CLASSES.INBOX_CLOSE} {
        font-size: 20px;
        line-height: 1;
    }

    .${CLASSES.INBOX_CLOSE}:hover,
    .${CLASSES.INBOX_NAV_BTN}:not(:disabled):hover,
    .${CLASSES.INBOX_BACK}:hover {
        background: rgba(255,255,255,0.08);
        color: white;
    }

    .${CLASSES.INBOX_NAV_BTN}:disabled {
        opacity: 0.35;
        cursor: default;
    }

    .${CLASSES.INBOX_LIST},
    .${CLASSES.INBOX_DETAIL} {
        flex: 1;
        overflow-y: auto;${SCROLLBAR}
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .${CLASSES.INBOX_CARD} {
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .${CLASSES.INBOX_LIST} .${CLASSES.INBOX_CARD} {
        cursor: pointer;
    }

    .${CLASSES.INBOX_LIST} .${CLASSES.INBOX_CARD}:hover {
        border-color: rgba(255,255,255,0.22);
    }

    .${CLASSES.INBOX_CARD}--resolved {
        border-color: rgba(48, 209, 88, 0.4);
        opacity: 0.75;
    }

    .${CLASSES.INBOX_LIST} .${CLASSES.INBOX_CARD}--resolved:hover {
        border-color: rgba(48, 209, 88, 0.7);
        opacity: 1;
    }

    /* \`opacity\` composites the card and everything inside it as one
       translucent layer, so a dropdown opened from a resolved card came out
       see-through: it was painted above the context block (hit-testing agreed)
       and still showed it through itself. A child cannot opt out of its
       group's opacity, so the group has to stop existing while a menu is open.
       Keyed on aria-expanded, which menus.js already toggles on every dropdown
       button — the picker strip and the \`...\` menu alike.
       The list hid this by accident: hovering the card to click its button
       already lifted the dim. The detail view has no such rule, which is
       where it showed. */
    .${CLASSES.INBOX_CARD}--resolved:has([aria-expanded="true"]) {
        opacity: 1;
    }

    .${CLASSES.INBOX_CARD_HEADER} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
    }

    /* Labels made the strip wide enough to overflow a narrow card in the
       worst case ("In progress" + "Improvement" + "Medium"), so it wraps to
       a second line rather than pushing the card sideways. */
    /* Classification on the left, tools on the right. The two groups let the
       row split without either half wrapping into the other's space. */
    .${CLASSES.INBOX_CARD_ACTIONS} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 8px;
    }
    /* The detail header borrows the same strip for its prev/next/close trio.
       There is no left-hand group there, so \`space-between\` scattered the
       three across the row — one against \`Back\`, one adrift in the middle.
       They are one cluster opposite \`Back\`, so the row lines up at its end;
       the 100% width stays, which is what keeps \`Back\` pinned left. */
    .${CLASSES.INBOX_DETAIL_HEADER} .${CLASSES.INBOX_CARD_ACTIONS} {
        justify-content: flex-end;
        gap: 2px;
    }

    .${CLASSES.ACTIONS_GROUP} {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px;
    }
    /* The tools never wrap: three 24px icons always fit, and wrapping them
       under the pickers put the ⋯ on a line of its own. */
    .${CLASSES.ACTIONS_GROUP_END} {
        flex-wrap: nowrap;
        gap: 2px;
    }

    .${CLASSES.INBOX_ACTION_BTN} {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: rgba(255,255,255,0.65);
        cursor: pointer;
    }

    .${CLASSES.INBOX_ACTION_BTN}:hover {
        background: rgba(255,255,255,0.08);
        color: white;
    }

    /* Status/type/priority pickers show their current value as text next to
       the dot (colour alone can't tell bug/high apart — same hex, and
       there's no hover on touch). The 72px cap they used to carry is gone:
       the strip has its own row now, so labels show in full. */
    .${CLASSES.INBOX_ACTION_BTN_LABELED} {
        width: auto;
        padding: 0 8px 0 6px;
        gap: 5px;
        justify-content: flex-start;
        flex: none;
    }

    .${CLASSES.INBOX_ACTION_LABEL} {
        font-size: 11px;
        line-height: 1;
        white-space: nowrap;
    }

    .${CLASSES.INBOX_STATUS_DOT} {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1.5px solid rgba(255,255,255,0.45);
        display: inline-block;
        flex: none;
    }

    .${CLASSES.INBOX_MENU_ITEM} .${CLASSES.INBOX_STATUS_DOT} {
        width: 9px;
        height: 9px;
        border: none;
        margin-right: 8px;
        vertical-align: baseline;
    }

    .${CLASSES.INBOX_MENU_ITEM}[aria-checked="true"] {
        background: rgba(255,255,255,0.08);
    }

    /* The action strip on its own row under the author. Shared by the inbox
       card and the thread popover so the two read the same; only the
       popover needs the extra top padding, since the card's column gap
       already spaces it. */
    .${CLASSES.THREAD_ACTIONS_ROW} {
        display: flex;
        justify-content: flex-end;
    }

    .${CLASSES.THREAD_POPOVER} > .${CLASSES.THREAD_ACTIONS_ROW} {
        padding-top: 8px;
    }

    /* Generic hover tooltip, same look as .thread-time[data-full-date] */
    [data-hd-tooltip] {
        position: relative;
    }

    [data-hd-tooltip]::after {
        content: attr(data-hd-tooltip);
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: #000;
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s ease;
        z-index: 2;
    }

    [data-hd-tooltip]:hover::after {
        opacity: 1;
    }

    .${CLASSES.INBOX_MENU} {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        background: #2C2C2E;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 4px;
        min-width: 130px;
        z-index: 1;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }

    /* Two classes, so this beats the base rule's \`top\` whatever the order. */
    .${CLASSES.INBOX_MENU}.${CLASSES.INBOX_MENU_UP} {
        top: auto;
        bottom: calc(100% + 4px);
    }

    /* The horizontal counterpart, set by the same measurement in menus.js.
       Hanging off the button's right edge is what the tools at the end of the
       strip want, but the status picker leads the row: its menu is wider than
       the button, so it reached past the panel's left edge and \`overflow:
       hidden\` took half of it. */
    .${CLASSES.INBOX_MENU}.${CLASSES.INBOX_MENU_START} {
        right: auto;
        left: 0;
    }

    .${CLASSES.INBOX_CARD_TEXT} {
        white-space: pre-wrap;
        word-break: break-word;
    }

    .${CLASSES.INBOX_CARD_TAG} {
        align-self: flex-start;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(255, 159, 10, 0.2);
        color: #FF9F0A;
        font-size: 11px;
        font-weight: 600;
    }

    .${CLASSES.INBOX_BADGES} {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }
    /* Vertical separation from the card text above only applies to the
       badge row on inbox cards -- inside the comment-box classify row,
       .inbox-badges is one flex item among the type/priority pickers and
       the tags input, and the classify row's own gap already spaces it
       from its siblings, so an extra margin here would nudge it out of
       alignment with them. */
    .${CLASSES.INBOX_CARD} .${CLASSES.INBOX_BADGES} {
        margin-top: 6px;
    }
    .${CLASSES.TOOLTIP} .${CLASSES.INBOX_BADGES} {
        margin-bottom: 4px;
    }
    .${CLASSES.BADGE} {
        display: inline-flex;
        align-items: center;
        padding: 1px 6px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 10px;
        font-size: 10px;
        line-height: 1.6;
        letter-spacing: 0.01em;
        white-space: nowrap;
    }
    .${CLASSES.BADGE_STATUS},
    .${CLASSES.BADGE_TYPE},
    .${CLASSES.BADGE_PRIORITY} {
        font-weight: 600;
    }
    .${CLASSES.BADGE_TAG} {
        opacity: 0.75;
    }
    .${CLASSES.BADGE_DURATION} {
        opacity: 0.75;
        border-style: dashed;
    }

    .${CLASSES.REACTION_BAR} {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 2px;
        margin-bottom: 12px;
    }
    /* Hidden rather than absent: the first reaction arrives from the trigger
       in the action row, so the row has to be mounted and waiting for it. */
    .${CLASSES.REACTION_BAR}[hidden] {
        display: none;
    }
    .${CLASSES.REACTION_TRIGGER} {
        position: relative;
        display: inline-flex;
    }
    .${CLASSES.REACTION_PILL} {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        height: 24px;
        padding: 0 8px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: transparent;
        color: #F2F2F7;
        font-family: inherit;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease;
    }
    .${CLASSES.REACTION_PILL}:hover {
        background: rgba(255, 255, 255, 0.08);
    }
    /* The blue the active marker and \`in_review\` already carry. It never
       stands alone: the count is text and aria-pressed says the rest
       (WCAG 1.4.1). */
    .${CLASSES.REACTION_PILL_MINE} {
        border-color: #2E90FA;
        background: rgba(46, 144, 250, 0.16);
    }
    .${CLASSES.REACTION_PILL_MINE}:hover {
        background: rgba(46, 144, 250, 0.24);
    }
    /* The platform emoji face, named explicitly: the widget's own stack is a
       UI sans that renders some of these as monochrome glyphs. */
    .${CLASSES.REACTION_PILL_EMOJI} {
        font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
        font-size: 13px;
    }
    .${CLASSES.REACTION_PILL_COUNT} {
        font-variant-numeric: tabular-nums;
    }
    /* Same box as a pill, so the row reads as one strip of controls. */
    .${CLASSES.REACTION_ADD} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 24px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        background: transparent;
        color: #8E8E93;
        cursor: pointer;
    }
    .${CLASSES.REACTION_ADD}:hover {
        color: #F2F2F7;
        border-color: rgba(255, 255, 255, 0.35);
    }
    /* No \`display\` here on purpose: attachMenuToggle drives it inline
       (none/block), so the row is held together by inline-flex items and
       nowrap instead of a flex container it would overwrite. */
    .${CLASSES.REACTION_PALETTE} {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        white-space: nowrap;
        background: #2C2C2E;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 4px;
        z-index: 1;
        box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    /* The action-row trigger sits at the right edge, so its palette opens
       leftward instead of pushing the popover wider. */
    .${CLASSES.ACTIONS_GROUP_END} .${CLASSES.REACTION_PALETTE},
    .${CLASSES.THREAD_REPLY_ACTIONS} .${CLASSES.REACTION_PALETTE} {
        left: auto;
        right: 0;
    }
    .${CLASSES.REACTION_PALETTE}.${CLASSES.INBOX_MENU_UP} {
        top: auto;
        bottom: calc(100% + 4px);
    }
    .${CLASSES.REACTION_PALETTE_ITEM} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
        font-size: 15px;
        cursor: pointer;
    }
    .${CLASSES.REACTION_PALETTE_ITEM}:hover {
        background: rgba(255, 255, 255, 0.12);
    }

    .${CLASSES.CONTEXT_BLOCK} {
        display: flex;
        flex-direction: column;
        padding: 10px 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
    }
    .${CLASSES.CONTEXT_BODY} {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .${CLASSES.CONTEXT_TITLE} {
        font-size: 11px;
        font-weight: 600;
        color: rgba(255,255,255,0.45);
        padding-bottom: 4px;
    }
    /* The popover's collapsed variant. Same weight and colour as the inbox
       title so the two surfaces read as the same block. */
    .${CLASSES.CONTEXT_TOGGLE} {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.45);
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        padding: 2px 0;
    }
    .${CLASSES.CONTEXT_TOGGLE}:hover {
        color: rgba(255,255,255,0.75);
    }
    .${CLASSES.CONTEXT_TOGGLE} svg {
        flex: none;
        transition: transform 0.15s ease;
    }
    .${CLASSES.CONTEXT_TOGGLE}[aria-expanded="true"] svg {
        transform: rotate(180deg);
    }
    .${CLASSES.CONTEXT_TOGGLE}[aria-expanded="true"] + .${CLASSES.CONTEXT_BODY} {
        padding-top: 8px;
    }
    .${CLASSES.CONTEXT_BLOCK} img {
        width: 100%;
        border-radius: 6px;
        margin-bottom: 6px;
        cursor: zoom-in;
    }
    .${CLASSES.CONTEXT_SCREENSHOT_CAPTION} {
        opacity: 0.75;
    }
    .${CLASSES.CONTEXT_ROW} {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        opacity: 0.75;
    }
    /* URLs and user agents have no spaces to break on, so the value column
       would otherwise push the row wider than the panel. */
    .${CLASSES.CONTEXT_ROW} span:last-child {
        text-align: right;
        word-break: break-all;
    }

    .${CLASSES.INBOX_CARD_REPLY_LINK} {
        align-self: flex-start;
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.55);
        font-size: 13px;
        cursor: pointer;
        padding: 0;
    }

    .${CLASSES.INBOX_CARD_REPLY_LINK}:hover {
        color: white;
    }

    .${CLASSES.INBOX_REPLIES} {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 0 4px;
    }

    /* A comment with no replies still gets this container, and as a zero-height
       flex item it collected a 12px gap on each side — a 24px hole between the
       context block and the reply box that read as broken with the context
       collapsed. Collapsing it in CSS rather than skipping the element in
       \`_renderDetail\` is deliberate: deleting the last reply drops its row in
       place (a full re-render would discard a half-typed reply), so the
       container empties out without the builder running again. */
    .${CLASSES.INBOX_REPLIES}:empty {
        display: none;
    }

    /* Sits under the body as a quiet aside: the preview shows the root
       comment only, so this says "there is more" without competing with it. */
    .${CLASSES.TOOLTIP_REPLY_COUNT} {
        font-size: 12px;
        color: rgba(255,255,255,0.45);
        padding-top: 4px;
    }

    /* Centred in whatever height the list has, so the state sits in the
       middle of the panel rather than clinging to the top. */
    .${CLASSES.INBOX_EMPTY} {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 32px 24px;
        color: rgba(255,255,255,0.55);
        text-align: center;
    }

    /* The marker's own silhouette, drawn as an outline: what the user is
       about to place, not a generic placeholder. Same border-radius as
       .comment-circle. */
    .${CLASSES.INBOX_EMPTY_ICON} {
        width: 44px;
        height: 44px;
        margin-bottom: 6px;
        border: 2px dashed rgba(255,255,255,0.25);
        border-radius: 0% 100% 100% 100%;
        flex: none;
    }

    .${CLASSES.INBOX_EMPTY_TITLE} {
        color: white;
        font-size: 14px;
        font-weight: 600;
    }

    .${CLASSES.INBOX_EMPTY_TEXT} {
        font-size: 13px;
        line-height: 1.5;
        max-width: 30ch;
    }

    .${CLASSES.INBOX_EMPTY_KBD} {
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        color: rgba(255,255,255,0.8);
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 5px;
        padding: 1px 5px;
        white-space: nowrap;
    }

    .${CLASSES.INBOX_EMPTY_ACTION} {
        margin-top: 6px;
        background: transparent;
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 8px;
        color: white;
        font-size: 13px;
        font-weight: 500;
        padding: 8px 16px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
    }

    .${CLASSES.INBOX_EMPTY_ACTION}:hover {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.35);
    }

    .${CLASSES.THREAD_HEADER} {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0;
    }

    /* min-width:0 is what lets the author actually shrink: a flex item
       defaults to min-content, so without it the name pushes the row wider
       instead of truncating. */
    .${CLASSES.THREAD_META} {
        display: flex;
        align-items: center;
        gap: 6px;
        flex: 1;
        min-width: 0;
    }

    .${CLASSES.THREAD_AUTHOR} {
        font-weight: 600;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .${CLASSES.THREAD_TIME} {
        font-size: 12px;
        color: rgba(255,255,255,0.5);
        cursor: default;
        position: relative;
        flex: none;
    }

    .${CLASSES.THREAD_TIME}::after {
        content: attr(data-full-date);
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: #000;
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
        z-index: 1;
    }

    .${CLASSES.THREAD_TIME}:hover::after {
        opacity: 1;
    }

    .${CLASSES.THREAD_BODY} {
        padding: 8px 0;
        white-space: pre-wrap;
        word-break: break-word;
    }

    .${CLASSES.THREAD_REPLIES} {
        padding: 0;
    }

    .${CLASSES.THREAD_REPLIES}:empty {
        display: none;
    }

    .${CLASSES.THREAD_REPLY} {
        padding: 16px 0 0 0;
        border-top: 1px solid rgba(255,255,255,0.1);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 14px;
        color: rgba(255,255,255,0.85);
    }

    .${CLASSES.THREAD_REPLY} .${CLASSES.THREAD_META} {
        margin-bottom: 2px;
    }

    /* Pushed to the far edge of the reply's meta row, where the same ⋯ sits
       on the comment above it. flex: none keeps it off the author's
       truncation budget. */
    .${CLASSES.THREAD_REPLY_ACTIONS} {
        margin-left: auto;
        flex: none;
    }

    .${CLASSES.THREAD_REPLY} .${CLASSES.SCREENSHOT_IMG} {
        width: 144px;
        height: 100px;
        object-fit: cover;
        border-radius: 8px;
        margin-top: 4px;
        cursor: pointer;
        display: block;
    }

    .${CLASSES.THREAD_INPUT_AREA} {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 12px 0 0;
        border-top: 1px solid rgba(255,255,255,0.1);
    }

    .${CLASSES.THREAD_INPUT} {
        width: 100%;
        background: transparent;
        border: none;
        padding: 0;
        color: white;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
    }

    .${CLASSES.THREAD_INPUT}::placeholder {
        color: rgba(255,255,255,0.5);
    }

    .${CLASSES.THREAD_INPUT}:focus {
        outline: none;
        box-shadow: none;
    }

    .${CLASSES.THREAD_SUBMIT} {
        background: none;
        border: none;
        color: #2E90FA;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: background 0.2s;
    }

    .${CLASSES.THREAD_SUBMIT}:hover {
        background: rgba(46, 144, 250, 0.15);
        color: #1570D6;
    }

    .${CLASSES.CLOSE_TOOLTIP} {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: rgba(255,255,255,0.5);
        line-height: 1;
    }
    
    .${CLASSES.CLOSE_TOOLTIP}:hover {
        color: white;
    }

    .${CLASSES.PREVIEW_CIRCLE} {
        animation: helldots-pulse 1.5s ease-in-out infinite;
    }

    @keyframes helldots-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(46, 144, 250, 0.4), 0 1px 5px rgba(0,0,0,0.2); }
        50% { box-shadow: 0 0 0 8px rgba(46, 144, 250, 0), 0 1px 5px rgba(0,0,0,0.2); }
    }

    .${CLASSES.COMMENT_OVERLAY} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: transparent;
        pointer-events: none;
        z-index: ${Z_INDEX.TOOLBAR - 1};
    }

    .${CLASSES.COMMENT_OVERLAY}.${CLASSES.ACTIVE} {
        pointer-events: auto;
        background: rgba(0, 0, 0, 0.1);
    }

    .${CLASSES.SELECTION_RECT} {
        position: fixed;
        border: 2px solid #2E90FA;
        background: rgba(46, 144, 250, 0.1);
        pointer-events: none;
        z-index: ${Z_INDEX.TOOLTIP};
        box-sizing: border-box;
    }

    .${CLASSES.SCREENSHOTS_CONTAINER} {
        display: none;
        overflow-x: auto;
        gap: 8px;
        margin-top: 4px;
        padding: 4px 0;
        scrollbar-width: none;
        -ms-overflow-style: none;
        margin-bottom: 8px;
    }

    .${CLASSES.SCREENSHOTS_CONTAINER}::-webkit-scrollbar {
        display: none;
    }

    .${CLASSES.SCREENSHOTS_CONTAINER}.${CLASSES.ACTIVE} {
        display: flex;
    }

    .${CLASSES.SCREENSHOT_ITEM} {
        position: relative;
        flex-shrink: 0;
    }

    .${CLASSES.SCREENSHOT_ITEM} .${CLASSES.SCREENSHOT_IMG} {
        width: 50px;
        height: 50px;
        object-fit: cover;
        border-radius: 8px;
        cursor: pointer;
        display: block;
        margin: 0;
    }

    .${CLASSES.SCREENSHOT_ITEM} .${CLASSES.SCREENSHOT_IMG}:hover {
        opacity: 0.85;
    }

    .${CLASSES.SCREENSHOT_ITEM} .${CLASSES.SCREENSHOT_REMOVE} {
        position: absolute;
        top: -5px;
        right: -5px;
        width: 18px;
        height: 18px;
        background: rgba(0,0,0,0.7);
        border: none;
        border-radius: 50%;
        color: white;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 1;
    }

    .${CLASSES.SCREENSHOT_ITEM}:hover .${CLASSES.SCREENSHOT_REMOVE} {
        display: flex;
    }

    .${CLASSES.SCREENSHOT_ITEM} .${CLASSES.SCREENSHOT_REMOVE}:hover {
        background: rgba(0,0,0,0.9);
    }

    .${CLASSES.TOOLTIP} > .${CLASSES.SCREENSHOTS_CONTAINER} .${
      CLASSES.SCREENSHOT_ITEM
    } .${CLASSES.SCREENSHOT_IMG},
    .${CLASSES.THREAD_SCROLL} > .${CLASSES.SCREENSHOTS_CONTAINER} .${
      CLASSES.SCREENSHOT_ITEM
    } .${CLASSES.SCREENSHOT_IMG},
    .${CLASSES.THREAD_REPLY} .${CLASSES.SCREENSHOT_ITEM} .${
      CLASSES.SCREENSHOT_IMG
    } {
        width: 144px;
        height: 100px;
    }

    .${CLASSES.CONFIRM} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        animation: helldots-fade-in 0.15s ease;
    }

    .${CLASSES.CONFIRM_PANEL} {
        width: min(360px, 100%);
        background: #1C1C1E;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        padding: 20px;
        color: white;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
    }

    /* :host { all: initial } does not reach descendants, so the heading and
       paragraph still arrive with UA margins. */
    .${CLASSES.CONFIRM_TITLE} {
        margin: 0 0 8px;
        font-size: 15px;
        font-weight: 600;
    }

    .${CLASSES.CONFIRM_MESSAGE} {
        margin: 0 0 20px;
        font-size: 13px;
        color: rgba(255,255,255,0.65);
    }

    .${CLASSES.CONFIRM_ACTIONS} {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .${CLASSES.CONFIRM_CANCEL},
    .${CLASSES.CONFIRM_ACCEPT} {
        padding: 7px 14px;
        border: 1px solid transparent;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
    }

    /* The one place in the widget with visible focus rings. The dialog traps
       Tab between exactly two buttons, one of them destructive, so a
       keyboard user who cannot see which one is focused is being asked to
       guess. Scoped here on purpose — see DECISIONS.md; it does not reopen
       the rings that were reverted elsewhere for visual parity. */
    .${CLASSES.CONFIRM_CANCEL}:focus-visible,
    .${CLASSES.CONFIRM_ACCEPT}:focus-visible {
        outline: 2px solid #2E90FA;
        outline-offset: 2px;
    }

    .${CLASSES.CONFIRM_CANCEL} {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.12);
        color: white;
    }

    .${CLASSES.CONFIRM_CANCEL}:hover {
        background: rgba(255,255,255,0.14);
    }

    .${CLASSES.CONFIRM_ACCEPT} {
        background: #FF453A;
        color: white;
    }

    .${CLASSES.CONFIRM_ACCEPT}:hover {
        background: #FF6961;
    }

    .${CLASSES.LIGHTBOX} {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.92);
        z-index: ${Z_INDEX.LIGHTBOX};
        display: flex;
        align-items: center;
        justify-content: center;
        animation: helldots-fade-in 0.2s ease;
    }

    @keyframes helldots-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .${CLASSES.LIGHTBOX_IMG} {
        max-width: 90vw;
        max-height: 90vh;
        object-fit: contain;
        border-radius: 8px;
    }

    .${CLASSES.LIGHTBOX_CLOSE} {
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255,255,255,0.15);
        border: none;
        color: white;
        font-size: 24px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
    }

    .${CLASSES.LIGHTBOX_CLOSE}:hover {
        background: rgba(255,255,255,0.3);
    }
    /* --- inline editor --- */

    .${CLASSES.EDITOR} {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 4px 0 2px;
    }

    .${CLASSES.EDITOR_INPUT} {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        min-height: 60px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 8px;
        padding: 8px 10px;
        color: white;
        font-size: 14px;
        font-family: inherit;
        line-height: 1.45;
        outline: none;${SCROLLBAR}
    }

    .${CLASSES.EDITOR_INPUT}:focus {
        border-color: rgba(46,144,250,0.7);
    }

    .${CLASSES.EDITOR_ACTIONS} {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .${CLASSES.EDITOR_CANCEL},
    .${CLASSES.EDITOR_SAVE} {
        padding: 5px 12px;
        border: 1px solid transparent;
        border-radius: 7px;
        font-size: 13px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
    }

    .${CLASSES.EDITOR_CANCEL} {
        background: rgba(255,255,255,0.08);
        border-color: rgba(255,255,255,0.12);
        color: white;
    }

    .${CLASSES.EDITOR_CANCEL}:hover {
        background: rgba(255,255,255,0.14);
    }

    .${CLASSES.EDITOR_SAVE} {
        background: #2E90FA;
        color: white;
    }

    .${CLASSES.EDITOR_SAVE}:hover:not(:disabled) {
        background: #57A6FB;
    }

    /* Blanking a body is not a way to delete — the comment would keep its
       marker, its replies and its inbox row while saying nothing. The
       disabled state is carried by more than colour: the cursor changes and
       the control stops responding (WCAG 1.4.1). */
    .${CLASSES.EDITOR_SAVE}:disabled {
        background: rgba(255,255,255,0.10);
        color: rgba(255,255,255,0.4);
        cursor: not-allowed;
    }

    .${CLASSES.THREAD_EDITED} {
        font-size: 12px;
        color: rgba(255,255,255,0.4);
        cursor: default;
        position: relative;
        flex: none;
    }

    .${CLASSES.THREAD_EDITED}::before {
        content: "·";
        margin-right: 4px;
    }

    .${CLASSES.THREAD_EDITED}::after {
        content: attr(data-full-date);
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: #000;
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 11px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;
    }

    .${CLASSES.THREAD_EDITED}:hover::after {
        opacity: 1;
    }

    .${CLASSES.AUDIT_BLOCK} {
        margin-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.08);
        padding-top: 8px;
    }

    .${CLASSES.AUDIT_TOGGLE} {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        padding: 4px 0;
        border: 0;
        background: none;
        color: rgba(255,255,255,0.55);
        font-family: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
    }

    .${CLASSES.AUDIT_TOGGLE}:hover {
        color: rgba(255,255,255,0.85);
    }

    /* A caret rather than a glyph: the disclosure state has to read without
       colour (WCAG 1.4.1), and rotating a border triangle costs no font. */
    .${CLASSES.AUDIT_TOGGLE}::before {
        content: "";
        width: 0;
        height: 0;
        border-left: 4px solid currentColor;
        border-top: 4px solid transparent;
        border-bottom: 4px solid transparent;
        transition: transform 0.15s ease;
    }

    .${CLASSES.AUDIT_TOGGLE}[aria-expanded="true"]::before {
        transform: rotate(90deg);
    }

    .${CLASSES.AUDIT_BODY} {
        padding: 4px 0 2px;
    }

    .${CLASSES.AUDIT_LIST} {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    /* Action and timestamp share the first row; the actor drops underneath
       the action, so a long transition label never squeezes the date out. */
    .${CLASSES.AUDIT_ROW} {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: baseline;
        column-gap: 8px;
        font-size: 12px;
        line-height: 1.4;
    }

    .${CLASSES.AUDIT_ACTION} {
        grid-column: 1;
        color: rgba(255,255,255,0.78);
    }

    .${CLASSES.AUDIT_ACTOR} {
        grid-column: 1;
        color: rgba(255,255,255,0.48);
        font-size: 11px;
    }

    .${CLASSES.AUDIT_TIME} {
        grid-row: 1;
        grid-column: 2;
        color: rgba(255,255,255,0.42);
        font-size: 11px;
        white-space: nowrap;
    }

    .${CLASSES.AUDIT_HEADING} {
        margin: 0 0 6px;
        color: rgba(255,255,255,0.5);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .${CLASSES.AUDIT_RESOLUTIONS} {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid rgba(255,255,255,0.06);
    }

    /* Metrics and close read as one cluster at the end of the row. The gap
       is wider than the header's own 8px because the two are different kinds
       of control — one opens a view, one dismisses the panel — and a tight
       pair invites the wrong click. */
    .${CLASSES.INBOX_HEADER_ACTIONS} {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .${CLASSES.INBOX_METRICS_BTN} {
        padding: 5px 10px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.75);
        font-family: inherit;
        font-size: 12px;
        white-space: nowrap;
        cursor: pointer;
    }

    .${CLASSES.INBOX_METRICS_BTN}:hover {
        background: rgba(255,255,255,0.11);
        color: #fff;
    }

    .${CLASSES.METRICS_VIEW} {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.22) transparent;
    }

    .${CLASSES.METRICS_VIEW}::-webkit-scrollbar { width: 8px; }
    .${CLASSES.METRICS_VIEW}::-webkit-scrollbar-track { background: transparent; }
    .${CLASSES.METRICS_VIEW}::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.22);
        border-radius: 4px;
    }

    .${CLASSES.METRICS_TILES} {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 8px;
    }

    .${CLASSES.METRICS_TILE} {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px;
        border-radius: 9px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
    }

    .${CLASSES.METRICS_TILE_VALUE} {
        color: #fff;
        font-size: 18px;
        font-weight: 600;
        line-height: 1.1;
    }

    .${CLASSES.METRICS_TILE_LABEL} {
        color: rgba(255,255,255,0.5);
        font-size: 11px;
        line-height: 1.3;
    }

    .${CLASSES.METRICS_GROUP} {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    .${CLASSES.METRICS_HEADING} {
        margin: 0;
        color: rgba(255,255,255,0.5);
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    /* Label, track and count on one line: the count is text beside the bar,
       never a value the reader has to infer from its length (WCAG 1.4.1). */
    .${CLASSES.METRICS_ROW} {
        display: grid;
        grid-template-columns: 76px 1fr 26px;
        align-items: center;
        gap: 8px;
        font-size: 12px;
    }

    .${CLASSES.METRICS_ROW_LABEL} {
        color: rgba(255,255,255,0.72);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .${CLASSES.METRICS_TRACK} {
        height: 8px;
        border-radius: 4px;
        background: rgba(255,255,255,0.07);
        overflow: hidden;
    }

    .${CLASSES.METRICS_BAR} {
        height: 100%;
        border-radius: 4px;
        background: rgba(255,255,255,0.42);
        min-width: 2px;
    }

    .${CLASSES.METRICS_ROW_COUNT} {
        color: rgba(255,255,255,0.85);
        font-variant-numeric: tabular-nums;
        text-align: right;
    }

    .${CLASSES.METRICS_CHART} {
        width: 100%;
        height: 96px;
        display: block;
        fill: rgba(255,255,255,0.42);
    }

    .${CLASSES.METRICS_AXIS} {
        display: flex;
        justify-content: space-between;
        color: rgba(255,255,255,0.42);
        font-size: 10px;
        font-variant-numeric: tabular-nums;
    }

    .${CLASSES.METRICS_EXPORTS} {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-top: 4px;
        border-top: 1px solid rgba(255,255,255,0.08);
    }

    .${CLASSES.METRICS_EXPORT_BTN} {
        padding: 6px 10px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.78);
        font-family: inherit;
        font-size: 12px;
        cursor: pointer;
    }

    .${CLASSES.METRICS_EXPORT_BTN}:hover {
        background: rgba(255,255,255,0.12);
        color: #fff;
    }

    .${CLASSES.METRICS_EMPTY} {
        margin: 0;
        padding: 24px 0;
        color: rgba(255,255,255,0.5);
        font-size: 13px;
        text-align: center;
    }

    .${CLASSES.INBOX_NOTICE} {
        margin: 0 0 10px;
        padding: 9px 11px;
        border-radius: 8px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.75);
        font-size: 13px;
        line-height: 1.4;
    }
`;

/**
 * Styles that must apply to the host page itself (outside the shadow root),
 * because they target elements HellDots doesn't own — e.g. `document.body`
 * while in comment mode. A shadow root's stylesheet never reaches outside
 * it, so these can't live in `getStyles()`; they're injected separately
 * into `document.head` instead (see `CommentOverlay.injectStyles`).
 */
export const getGlobalStyles = () => `
    .${CLASSES.COMMENT_CURSOR},
    .${CLASSES.COMMENT_CURSOR} * {
        cursor: url('${CURSOR_SVG}') ${CURSOR_HOTSPOT}, auto !important;
    }

`;

/**
 * Styles for the printable metrics report. A separate sheet from getStyles()
 * because it dresses a different document — the report's own frame — and
 * because paper is white: printing the widget's dark surface would put a
 * black slab through the printer and render the text unreadable in
 * greyscale. Delivered through mountStyles like everything else, so a strict
 * `style-src` cannot blank it.
 */
export const getReportStyles = () => `
    .report {
        margin: 0;
        padding: 24px;
        background: #fff;
        color: #111;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        line-height: 1.45;
    }

    .report-title {
        margin: 0 0 4px;
        font-size: 20px;
    }

    .report-meta {
        margin: 0 0 2px;
        color: #555;
        font-size: 11px;
    }

    .report-table {
        width: 100%;
        margin-top: 18px;
        border-collapse: collapse;
        /* Keeps a dimension's table from being split across two sheets. */
        break-inside: avoid;
    }

    .report-table caption {
        margin-bottom: 4px;
        font-size: 12px;
        font-weight: 600;
        text-align: left;
    }

    .report-table th,
    .report-table td {
        padding: 5px 8px;
        border: 1px solid #d5d5d5;
        text-align: left;
        font-weight: 400;
    }

    .report-table thead th {
        background: #f2f2f2;
        font-weight: 600;
    }

    .report-table td {
        text-align: right;
        font-variant-numeric: tabular-nums;
    }

    @page {
        margin: 14mm;
    }
`;
