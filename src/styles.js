import { CLASSES, IDS, Z_INDEX, CURSOR_SVG } from "./constants.js";

export const getStyles = () => `

    button {
        padding: 0;
    }

    #${IDS.TOOLBAR} {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        padding: 8px 12px;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: ${Z_INDEX.TOOLBAR};
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .${CLASSES.TOOLBAR_CONTENT} {
        display: flex;
        align-items: center;
        gap: 8px;
        color: white;
        cursor: pointer;
        padding: 4px;
        border-radius: 6px;
        transition: background-color 0.2s;
    }
    
    .${CLASSES.TOOLBAR_CONTENT}:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    
    .${CLASSES.TOOLBAR_CONTENT}.${CLASSES.ACTIVE} {
        background: rgba(255, 255, 255, 0.2);
    }
    
    .${CLASSES.TOOLBAR_TEXT} {
        font-size: 14px;
        font-weight: 500;
    }
    
    .${CLASSES.SHORTCUT_HINT} {
        color: #ffffff;
        font-size: 12px;
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
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
    }

    #${IDS.COMMENT_INPUT}::placeholder {
        color: rgba(255, 255, 255, 0.4);
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
        color: rgba(255,255,255,0.4);
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

    .${CLASSES.COMMENT_CURSOR} {
        cursor: url('${CURSOR_SVG}') 6 6, auto !important;
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

    .${CLASSES.SCREENSHOT_PREVIEW} {
        position: relative;
        margin-top: 12px;
        margin-bottom: 0;
        display: none;
        width: fit-content;
    }

    .${CLASSES.SCREENSHOT_PREVIEW}.${CLASSES.ACTIVE} {
        display: block;
    }

    .${CLASSES.SCREENSHOT_PREVIEW} .${CLASSES.SCREENSHOT_IMG} {
        width: 50px;
        height: 50px;
        object-fit: cover;
        border-radius: 6px;
        display: block;
        cursor: pointer;
    }

    .${CLASSES.SCREENSHOT_IMG} {
        width: 100%;
        border-radius: 8px;
        display: block;
        cursor: pointer;
        margin-top: 4px;
        margin-bottom: 16px;
    }

    .${CLASSES.SCREENSHOT_IMG}:hover {
        opacity: 0.85;
    }

    .${CLASSES.SCREENSHOT_REMOVE} {
        position: absolute;
        top: 6px;
        right: 2px;
        width: 18px;
        height: 18px;
        background: rgba(0,0,0,0.7);
        border: none;
        border-radius: 50%;
        color: white;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .${CLASSES.SCREENSHOT_REMOVE}:hover {
        background: rgba(0,0,0,0.9);
    }

    .${CLASSES.TOOLTIP} > .${CLASSES.SCREENSHOT_IMG},
    .${CLASSES.THREAD_POPOVER} > .${CLASSES.SCREENSHOT_IMG} {
        width: 144px;
        height: 100px;
        object-fit: cover;
        border-radius: 8px;
        margin-top: 4px;
        cursor: pointer;
        display: block;
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
