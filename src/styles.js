import { CLASSES, IDS, Z_INDEX, CURSOR_SVG } from "./constants.js";

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
        width: 400px;
        display: none;
        box-sizing: border-box;
    }
    
    #${IDS.COMMENT_BOX} .${CLASSES.COMMENT_INPUT_AREA} {
        display: flex;
        flex-direction: column;
        gap: 0;
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
        padding-top: 4px;
        padding-bottom: 8px;
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
        width: 28px;
        height: 28px;
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

    .${CLASSES.CIRCLE_WRAPPER} {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: ${Z_INDEX.CIRCLE};
    }

    .${CLASSES.TOOLTIP} {
        position: fixed;
        background: #1C1C1E;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        width: 400px;
        z-index: ${Z_INDEX.TOOLTIP};
        color: white;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
    }

    .${CLASSES.TOOLTIP} .${CLASSES.THREAD_HEADER} {
        padding: 0 0 0;
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
        width: 400px;
        z-index: ${Z_INDEX.TOOLTIP};
        color: white;
        font-size: 14px;
        line-height: 1.5;
        box-sizing: border-box;
    }

    .${CLASSES.THREAD_HEADER} {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 0 0;
    }

    .${CLASSES.THREAD_META} {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .${CLASSES.THREAD_AUTHOR} {
        font-weight: 600;
        font-size: 13px;
    }

    .${CLASSES.THREAD_TIME} {
        font-size: 12px;
        color: rgba(255,255,255,0.5);
        cursor: default;
        position: relative;
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
        font-size: 13px;
        color: rgba(255,255,255,0.85);
    }

    .${CLASSES.THREAD_REPLY} .${CLASSES.THREAD_META} {
        margin-bottom: 2px;
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
        margin-bottom: 16px;
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
    .${CLASSES.THREAD_POPOVER} > .${CLASSES.SCREENSHOTS_CONTAINER} .${
      CLASSES.SCREENSHOT_ITEM
    } .${CLASSES.SCREENSHOT_IMG},
    .${CLASSES.THREAD_REPLY} .${CLASSES.SCREENSHOT_ITEM} .${
      CLASSES.SCREENSHOT_IMG
    } {
        width: 144px;
        height: 100px;
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
`;

/**
 * Styles that must apply to the host page itself (outside the shadow root),
 * because they target elements HellDots doesn't own — e.g. `document.body`
 * while in comment mode. A shadow root's stylesheet never reaches outside
 * it, so these can't live in `getStyles()`; they're injected separately
 * into `document.head` instead (see `CommentOverlay.injectStyles`).
 */
export const getGlobalStyles = () => `
    .${CLASSES.COMMENT_CURSOR} {
        cursor: url('${CURSOR_SVG}') 6 6, auto !important;
    }
`;
