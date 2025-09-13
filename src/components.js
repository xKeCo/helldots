import { CLASSES, IDS } from './constants.js';

const getShortcutText = (options) => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    const modifierMap = {
        alt: isMac ? '⌥' : 'Alt',
        ctrl: isMac ? '⌘' : 'Ctrl',
        shift: '⇧'
    };

    const modifier = modifierMap[options.shortcutModifier] || modifierMap.alt;
    const key = options.shortcutKey?.toUpperCase() || 'C';
    
    return `${modifier} + ${key}`;
};

export const createToolbar = (options = {}) => {
    const toolbar = document.createElement("div");
    toolbar.id = IDS.TOOLBAR;
    toolbar.innerHTML = `
        <div class="${CLASSES.TOOLBAR_CONTENT}">
            <span class="${CLASSES.TOOLBAR_TEXT}">Comment</span>
            <span class="${CLASSES.SHORTCUT_HINT}">${getShortcutText(options)}</span>
        </div>
    `;
    return toolbar;
};

export const createCommentBox = () => {
    const commentBox = document.createElement("div");
    commentBox.id = IDS.COMMENT_BOX;
    commentBox.innerHTML = `
        <textarea id="${IDS.COMMENT_INPUT}" placeholder="Type your comment..."></textarea>
        <div class="${CLASSES.COMMENT_ACTIONS}">
            <button id="${IDS.SUBMIT_COMMENT}">Save</button>
            <button id="${IDS.CANCEL_COMMENT}">Cancel</button>
        </div>
    `;
    commentBox.style.display = "none";
    return commentBox;
};

export const createCommentCircle = (comment) => {
    const circle = document.createElement("div");
    circle.className = CLASSES.CIRCLE;
    circle.dataset.commentId = comment.id;
    circle.dataset.commentText = comment.text;
    
    // Establecer el posicionamiento inicial
    circle.style.cssText = `
        position: absolute;
        left: ${comment.relativeX * 100}%;
        top: ${comment.relativeY * 100}%;
        transform: translate(-50%, -50%);
        pointer-events: auto;
    `;
    
    return circle;
};

export const createTooltip = (comment, circle) => {
    const tooltip = document.createElement("div");
    tooltip.className = CLASSES.TOOLTIP;
    tooltip.textContent = comment.text;
    tooltip.dataset.for = comment.id;
    
    const closeButton = document.createElement("span");
    closeButton.className = CLASSES.CLOSE_TOOLTIP;
    closeButton.innerHTML = "×";
    
    tooltip.appendChild(closeButton);
    return tooltip;
}; 