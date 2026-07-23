# Horizontal Panes for Logseq

A minimal proof of concept that recreates the horizontal workflow from
[`azlen/roam-themes`](https://github.com/azlen/roam-themes) without replacing
Logseq's editor.

The plugin keeps Logseq's current page as the first fixed-width pane. Pages and
blocks opened in Logseq's right sidebar become equally sized panes to its right,
so two or more panes can be visible in the same desktop window. Logseq prepends
native sidebar items, so the plugin uses the same `row-reverse` technique as
Azlen's theme to make each new pane appear at the far right. The complete app
row is the horizontal scroll container.

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
- `Horizontal Panes: Focus next pane` (`Cmd/Ctrl+Alt+Right`)
- `Horizontal Panes: Focus previous pane` (`Cmd/Ctrl+Alt+Left`)

Pane width, pane spacing, and optional scroll snapping are configurable in the
plugin settings.

## Deliberate constraints

This proof of concept does not reorder or reparent Logseq's React-owned DOM
nodes. It relies on native sidebar creation, editing, collapse, and close
behaviour. A small mutation observer is used only to notice a newly opened
native pane and scroll it into view.

That keeps the implementation close to the Roam theme and avoids the editor
state desynchronization caused by treating rendered Logseq elements as an
independent window manager.
