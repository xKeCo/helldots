import { CLASSES, IDS } from './constants.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatRelativeTime = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
};

const formatFullDate = (date) => {
  const d = new Date(date);
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${month} ${day}, ${hours}:${minutes} ${ampm}`;
};

const createMetaElement = (author, createdAt) => {
  const meta = document.createElement('div');
  meta.className = CLASSES.THREAD_META;

  const authorEl = document.createElement('span');
  authorEl.className = CLASSES.THREAD_AUTHOR;
  authorEl.textContent = author || 'Anonymous';

  const separator = document.createElement('span');
  separator.textContent = '·';
  separator.style.color = 'rgba(255,255,255,0.3)';

  const timeEl = document.createElement('span');
  timeEl.className = CLASSES.THREAD_TIME;
  timeEl.textContent = formatRelativeTime(createdAt);
  timeEl.dataset.fullDate = formatFullDate(createdAt);

  meta.appendChild(authorEl);
  meta.appendChild(separator);
  meta.appendChild(timeEl);

  return meta;
};

const getShortcutText = (options) => {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const modifierMap = {
    alt: isMac ? '⌥' : 'Alt',
    ctrl: isMac ? '⌘' : 'Ctrl',
    shift: '⇧',
  };

  const modifier = modifierMap[options.shortcutModifier] || modifierMap.alt;
  const key = options.shortcutKey?.toUpperCase() || 'C';

  return `${modifier} + ${key}`;
};

export const createToolbar = (options = {}) => {
  const toolbar = document.createElement('div');
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
  const commentBox = document.createElement('div');
  commentBox.id = IDS.COMMENT_BOX;
  commentBox.innerHTML = `
        <div class="${CLASSES.COMMENT_INPUT_AREA}">
            <textarea id="${IDS.COMMENT_INPUT}" placeholder="Type your comment..." rows="1"></textarea>
            <button id="${IDS.SUBMIT_COMMENT}" class="${CLASSES.THREAD_SUBMIT}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/></svg>
            </button>
        </div>
    `;
  commentBox.style.display = 'none';
  return commentBox;
};

export const createCommentCircle = (comment) => {
  const circle = document.createElement('div');
  circle.className = CLASSES.CIRCLE;
  circle.dataset.commentId = comment.id;
  circle.dataset.commentText = comment.text;

  // Basic positioning - will be updated by position validation system
  circle.style.cssText = `
        position: absolute;
        pointer-events: auto;
    `;

  return circle;
};

export const createTooltip = (comment) => {
  const tooltip = document.createElement('div');
  tooltip.className = CLASSES.TOOLTIP;
  tooltip.dataset.for = comment.id;

  const header = document.createElement('div');
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(comment.author, comment.createdAt);
  const closeButton = document.createElement('span');
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.innerHTML = '&times;';

  header.appendChild(meta);
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = CLASSES.THREAD_BODY;
  body.textContent = comment.text;

  tooltip.appendChild(header);
  tooltip.appendChild(body);
  return tooltip;
};

export const createReplyElement = (reply) => {
  const replyEl = document.createElement('div');
  replyEl.className = CLASSES.THREAD_REPLY;

  const meta = createMetaElement(reply.author, reply.timestamp);
  const text = document.createElement('div');
  text.textContent = reply.text;

  replyEl.appendChild(meta);
  replyEl.appendChild(text);
  return replyEl;
};

export const createThreadPopover = (comment) => {
  const popover = document.createElement('div');
  popover.className = CLASSES.THREAD_POPOVER;
  popover.dataset.for = comment.id;

  const header = document.createElement('div');
  header.className = CLASSES.THREAD_HEADER;

  const meta = createMetaElement(comment.author, comment.createdAt);
  const closeButton = document.createElement('span');
  closeButton.className = CLASSES.CLOSE_TOOLTIP;
  closeButton.innerHTML = '&times;';

  header.appendChild(meta);
  header.appendChild(closeButton);

  const body = document.createElement('div');
  body.className = CLASSES.THREAD_BODY;
  body.textContent = comment.text;

  const replies = document.createElement('div');
  replies.className = CLASSES.THREAD_REPLIES;
  if (comment.replies) {
    comment.replies.forEach((reply) => {
      replies.appendChild(createReplyElement(reply));
    });
  }

  const inputArea = document.createElement('div');
  inputArea.className = CLASSES.THREAD_INPUT_AREA;

  const input = document.createElement('input');
  input.className = CLASSES.THREAD_INPUT;
  input.placeholder = 'Reply...';
  input.type = 'text';

  const submitBtn = document.createElement('button');
  submitBtn.className = CLASSES.THREAD_SUBMIT;
  submitBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"/></svg>';

  inputArea.appendChild(input);
  inputArea.appendChild(submitBtn);

  popover.appendChild(header);
  popover.appendChild(body);
  popover.appendChild(replies);
  popover.appendChild(inputArea);

  return popover;
};
