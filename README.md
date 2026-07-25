# Horizontal Panes for Logseq

A minimal proof of concept that recreates the horizontal workflow from
[`azlen/roam-themes`](https://github.com/azlen/roam-themes) without replacing
Logseq's editor.

The plugin keeps Logseq's current page as the first fixed-width pane. Pages and
blocks opened in Logseq's right sidebar become equally sized panes to its right,
so two or more panes can be visible in the same desktop window. Logseq prepends
native sidebar items; the plugin assigns visual flex order without moving those
items, making each new pane appear at the far right. The complete app row is the
horizontal scroll container.

## Try it

```bash
npm install
npm run build
```

In Logseq:

1. Enable developer mode.
2. Open `Settings > Plugins`.
3. Choose `Load unpacked plugin`.
4. Select this directory.
5. Shift-click page references or block bullets to open native sidebar items.
6. Shift-scroll, use a horizontal trackpad gesture, or drag the bottom
   scrollbar to move through the panes.

The plugin is enabled by default. Use the columns button in Logseq's toolbar or
run `Horizontal Panes: Toggle mode` from the command palette to switch it off.

## Commands

- `Horizontal Panes: Open current page as pane`
- `Horizontal Panes: Focus main page`
- `Horizontal Panes: Focus pane left` (`Cmd/Ctrl+[`)
- `Horizontal Panes: Focus pane right` (`Cmd/Ctrl+]`)
- `Horizontal Panes: Back in focused pane`
- `Horizontal Panes: Forward in focused pane`
- `Horizontal Panes: Move focused pane left` (`Cmd/Ctrl+Shift+[`)
- `Horizontal Panes: Move focused pane right` (`Cmd/Ctrl+Shift+]`)

All of these commands can be assigned different shortcuts through Logseq's
keyboard-shortcut settings. The bracket combinations above remain the plugin's
direct default controls.

The focus shortcuts replace Logseq's default Back and Forward shortcuts. They
also enter edit mode: the plugin remembers the last edited block and caret
selection in each pane and restores them when returning. A pane that has not
been edited yet opens its first editable block with the caret at the end. The
focused pane is centered in the visible workspace whenever the available
horizontal scroll range permits it.

The main-page width, sidebar-pane width, the gap after the main page, the gap
between sidebar panes, and optional scroll snapping are independently
configurable in the plugin settings. With the default-off **Navigate links
within panes** setting, plain-clicking a page, tag, block reference, or block
bullet replaces its pane, while Shift-clicking inserts a new pane immediately
to its right. If the target is already open, the existing pane is focused
without closing or reordering any panes.

Drag the right border of any expanded sidebar pane to give it an individual
width for the current session. The resize target extends into the surrounding
gap, so it does not require pixel-perfect pointing or interfere with the pane's
vertical scrollbar. Double-click the same border to restore the configured
default pane width. Manual widths follow panes when they are reordered and are
retained while their contents navigate through history. They are discarded
when horizontal mode is disabled or Logseq is restarted.

Each expanded sidebar pane has its own Back and Forward buttons in the native
header. Plain-click replacements are added to that pane's history; a
Shift-clicked pane starts with a fresh history. Moving a pane carries its
history with it, while closing the pane or restarting Logseq discards it.
Returning through history also restores the pane's vertical scroll position
and its last edited block and caret selection.

Logseq does not permit two native root panes for the same block or page. If a
historical target is already open elsewhere, the plugin focuses that pane
without consuming the original pane's history or changing the layout.

## Deliberate constraints

This proof of concept never reorders or reparents Logseq's React-owned DOM
nodes. Reordering changes the panes' CSS flex order only. The plugin relies on
native sidebar creation, editing, collapse, and close behaviour. A small
mutation observer notices newly opened panes, maintains their visual order,
transfers session history during replacement, and scrolls them into view. The
plugin adds only its history controls to each native header. Editor restoration
activates native block content and then focuses Logseq's own mounted editor; it
does not create or replace an editor.

That keeps the implementation close to the Roam theme and avoids the editor
state desynchronization caused by treating rendered Logseq elements as an
independent window manager.
