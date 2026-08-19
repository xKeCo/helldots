// The audit trail as a disclosure in the inbox detail — closed by default,
// with its open/closed state owned by the panel rather than the DOM, for the
// same reason the context block's is: the detail is rebuilt on every
// refresh(), and a flag living in the markup would fold itself back shut.

import { CLASSES } from "./constants.js";
import { formatTemplate, formatDuration } from "./i18n.js";
import {
  statusLabelOf,
  typeLabelOf,
  priorityLabelOf,
} from "./comment-actions.js";
import { resolutionsOf } from "./audit.js";

const formatStamp = (iso, locale) =>
  new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

// A move reads "Status: Open → Resolved" — the field name and both values
// come from the dictionaries the pickers already use, so a state is never
// called one thing in the picker and another in the trail.
const MOVES = {
  status: (strings) => [strings.statusLabel, (v) => statusLabelOf(v, strings)],
  type: (strings) => [strings.typeLabel, (v) => typeLabelOf(v, strings)],
  priority: (strings) => [
    strings.priorityLabel,
    (v) => priorityLabelOf(v, strings),
  ],
};

const moveLabel = (field, entry, strings) => {
  const move = MOVES[field];
  if (!move) return "";
  const [name, valueOf] = move(strings);
  return `${name}: ${valueOf(entry.from ?? null)} → ${valueOf(entry.to ?? null)}`;
};

const labelFor = (entry, strings) => {
  switch (entry.type) {
    case "created":
      return strings.auditCreated;
    case "edited":
      return strings.auditEdited;
    case "status":
      return moveLabel("status", entry, strings);
    case "classified":
      // Tags are a list, so there is no two-value transition to render — the
      // change gets its own sentence instead of a malformed arrow.
      return entry.field === "tags"
        ? strings.auditTagsChanged
        : moveLabel(entry.field, entry, strings);
    default:
      return "";
  }
};

const buildRow = (entry, strings, locale) => {
  const row = document.createElement("li");
  row.className = CLASSES.AUDIT_ROW;

  const action = document.createElement("span");
  action.className = CLASSES.AUDIT_ACTION;
  action.textContent = labelFor(entry, strings);

  // The display name, never the id: the id is identity, not copy — the rule
  // the reaction pills already follow.
  const actor = document.createElement("span");
  actor.className = CLASSES.AUDIT_ACTOR;
  actor.textContent = entry.actor?.name || strings.anonymous;

  const time = document.createElement("time");
  time.className = CLASSES.AUDIT_TIME;
  time.dateTime = entry.at;
  time.textContent = formatStamp(entry.at, locale);

  row.append(action, actor, time);
  return row;
};

/**
 * The resolutions a reopen superseded. Rendered only when one exists: a
 * comment resolved once already carries its elapsed time in the badge strip,
 * and repeating it here would be a third place for one fact.
 */
const buildResolutions = (comment, strings, locale) => {
  const superseded = resolutionsOf(comment).filter((r) => r.reopenedAt);
  if (superseded.length === 0) return null;

  const section = document.createElement("div");
  section.className = CLASSES.AUDIT_RESOLUTIONS;
  section.dataset.auditResolutions = "";

  const heading = document.createElement("h4");
  heading.className = CLASSES.AUDIT_HEADING;
  heading.textContent = strings.auditPreviousResolutions;
  section.appendChild(heading);

  const list = document.createElement("ul");
  list.className = CLASSES.AUDIT_LIST;
  for (const resolution of superseded) {
    const item = document.createElement("li");
    item.className = CLASSES.AUDIT_ROW;

    const action = document.createElement("span");
    action.className = CLASSES.AUDIT_ACTION;
    action.textContent = formatTemplate(
      strings.auditResolvedInTemplate,
      formatDuration(resolution.ms, strings) || "—"
    );

    const time = document.createElement("time");
    time.className = CLASSES.AUDIT_TIME;
    time.dateTime = resolution.resolvedAt;
    time.textContent = formatStamp(resolution.resolvedAt, locale);

    item.append(action, time);
    list.appendChild(item);
  }
  section.appendChild(list);
  return section;
};

/**
 * @param {object} comment
 * @param {{
 *   strings: Record<string, string>,
 *   locale: string,
 *   open: boolean,
 *   onToggle: (open: boolean) => void,
 * }} deps
 * @returns {HTMLElement | null} null for a comment that predates the log, so
 *   an older corpus shows nothing rather than an empty box
 */
export function createAuditTrail(comment, { strings, locale, open, onToggle }) {
  const history = comment?.history;
  if (!Array.isArray(history) || history.length === 0) return null;

  const wrapper = document.createElement("div");
  wrapper.className = CLASSES.AUDIT_BLOCK;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = CLASSES.AUDIT_TOGGLE;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = formatTemplate(
    strings.auditToggleTemplate,
    history.length
  );

  const body = document.createElement("div");
  body.className = CLASSES.AUDIT_BODY;
  body.hidden = !open;

  const list = document.createElement("ul");
  list.className = CLASSES.AUDIT_LIST;
  list.setAttribute("aria-label", strings.auditTrailLabel);
  // Newest first: the question a trail answers is almost always "what just
  // happened", not "how did this start".
  for (const entry of [...history].reverse()) {
    list.appendChild(buildRow(entry, strings, locale));
  }
  body.appendChild(list);

  const resolutions = buildResolutions(comment, strings, locale);
  if (resolutions) body.appendChild(resolutions);

  toggle.addEventListener("click", () => {
    const next = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(next));
    body.hidden = !next;
    onToggle?.(next);
  });

  wrapper.append(toggle, body);
  return wrapper;
}
