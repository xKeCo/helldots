import { CLASSES, IDS, Z_INDEX, CURSOR_SVG } from './constants.js';

export const getStyles = () => `
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
        box-shadow: 0 3px 15px rgba(0,0,0,0.3);
        padding: 12px;
        z-index: ${Z_INDEX.COMMENT_BOX};
        width: 300px;
        display: none;
    }
    
    #${IDS.COMMENT_INPUT} {
        width: 100%;
        min-height: 40px;
        background: #2C2C2E;
        border: none;
        border-radius: 8px;
        padding: 12px;
        resize: none;
        margin-bottom: 10px;
        font-family: inherit;
        color: white;
        font-size: 14px;
    }

    #${IDS.COMMENT_INPUT}::placeholder {
        color: rgba(255, 255, 255, 0.6);
    }
    
    #${IDS.COMMENT_INPUT}:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(46, 144, 250, 0.5);
    }
    
    .${CLASSES.COMMENT_ACTIONS} {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }
    
    .${CLASSES.COMMENT_ACTIONS} button {
        padding: 8px 16px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
    }
    
    #${IDS.SUBMIT_COMMENT} {
        background: #2E90FA;
        color: white;
    }

    #${IDS.SUBMIT_COMMENT}:hover {
        background: #1570D6;
    }
    
    #${IDS.CANCEL_COMMENT} {
        background: #3A3A3C;
        color: white;
    }

    #${IDS.CANCEL_COMMENT}:hover {
        background: #2C2C2E;
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
        background: white;
        border-radius: 5px;
        padding: 10px;
        box-shadow: 0 2px 15px rgba(0,0,0,0.2);
        max-width: 250px;
        z-index: ${Z_INDEX.TOOLTIP};
        white-space: pre-wrap;
        line-height: 1.4;
    }

    .${CLASSES.CLOSE_TOOLTIP} {
        position: absolute;
        top: 2px;
        right: 6px;
        font-size: 16px;
        cursor: pointer;
        color: #95a5a6;
    }
    
    .${CLASSES.CLOSE_TOOLTIP}:hover {
        color: #e74c3c;
    }

    .${CLASSES.COMMENT_CURSOR} {
        cursor: url('${CURSOR_SVG}') 20 20, auto !important;
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
`;
