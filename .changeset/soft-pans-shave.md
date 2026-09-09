---
"helldots": patch
---

Give the text fields a readable surface and move the focus cue off the text.
`#comment-input` and `.thread-input` were borderless and unpadded, so the
`inset 0 -2px 0` underline they took on focus was painted through the
descenders of the line being typed — `.thread-input` is one line tall. All
three fields now share the inline editor's rounded, padded surface and light
their own edge on focus: a blue border plus a soft glow around the same box.

Also removes the horizontal scrollbar the screenshot strip put on the whole
thread. Its `margin-inline: -4px` made the strip wider than `.thread-scroll`,
which is `overflow-y: auto` and so scrolls on both axes.
