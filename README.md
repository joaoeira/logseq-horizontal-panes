# Horizontal Panes for Logseq

Horizontal Panes turns Logseq into a horizontally scrolling workspace inspired
by the stacked-pane workflows in
[`azlen/roam-themes`](https://github.com/azlen/roam-themes) and Obsidian.
Logseq's current page remains the first pane, while pages and blocks opened in
the right sidebar form an ordered strip to its right.

The plugin builds on Logseq's native pages, blocks, sidebar controls, and editor
rather than replacing them. Panes remain fully editable and can be collapsed,
closed, reordered, resized, and navigated independently.

## Features

- An effectively unbounded horizontal workspace using Logseq's native sidebar
  panes.
- Independent widths for the main page and sidebar panes, plus configurable
  gaps and optional scroll snapping.
- Plain-click pane replacement and Shift-click insertion for page references,
  tags, block references, and block bullets.
- Per-pane Back and Forward history with native header buttons.
- Integration with Logseq's own Back and Forward commands, configured
  shortcuts, and top-bar arrows.
- Keyboard commands for focusing, navigating, and reordering panes, all
  configurable from Logseq's keymap.
- Automatic restoration of each pane's vertical scroll position, last edited
  block, and caret selection.
- Mouse resizing for individual panes, with a forgiving resize target and
  double-click reset.
- Stable visual ordering without moving or reparenting Logseq's React-owned DOM
  nodes.

## Installation

Until the plugin is distributed through the Logseq Marketplace, install it as
an unpacked plugin:

```bash
npm install
npm run build
```

Then in Logseq:

1. Enable developer mode.
2. Open `Settings > Plugins`.
3. Choose `Load unpacked plugin`.
4. Select this repository's directory.

The plugin is enabled by default. Use the columns button in Logseq's toolbar or
run `Horizontal Panes: Toggle mode` from the command palette to switch it on or
off.

When developing locally, run `npm run build` and use **Reload** on the unpacked
plugin. Restart Logseq only when reloading is insufficient.

## Working with panes

By default, Shift-click a page reference or block bullet to open it through
Logseq's native right sidebar. New sidebar items appear as panes at the visual
right edge of the workspace.

Enable **Navigate links within panes** for a stacked-pane navigation model:

- Plain-click a page, tag, block reference, or block bullet to replace the
  current pane.
- Shift-click the same targets to insert a new pane immediately to the right.
- If the target is already open, the plugin focuses its existing pane without
  closing or reordering anything.

Use a horizontal trackpad gesture, Shift-scroll, or the bottom scrollbar to
move through the workspace. Focusing a pane centers it whenever the available
horizontal scroll range permits.

### Pane history

Each expanded sidebar pane has Back and Forward buttons in its native header.
Plain-click replacements are recorded in that pane's history; an inserted pane
starts with a fresh history. History follows a pane when it is reordered and
restores its vertical scroll position, last edited block, and caret selection.

Logseq's own Back and Forward actions—including its configured shortcuts,
command-palette commands, and top-bar arrows—operate on the focused pane. When
the main page is focused, they retain Logseq's normal main-page history
behaviour. Reaching either end of a pane's history does not fall through and
unexpectedly navigate the main page.

Pane histories are session state. Closing a pane or restarting Logseq discards
its history.

### Resizing panes

Drag the right border of an expanded sidebar pane to resize that pane for the
current session. The resize target extends into the surrounding gap, so it does
not require pixel-perfect pointing or interfere with the vertical scrollbar.
Double-click the same border to restore the configured default pane width.

Manual widths follow panes when they are reordered or navigated. They are
discarded when horizontal mode is disabled or Logseq is restarted.

## Commands and keybindings

- `Horizontal Panes: Toggle mode`
- `Horizontal Panes: Open current page as pane`
- `Horizontal Panes: Focus main page`
- `Horizontal Panes: Focus pane left`
- `Horizontal Panes: Focus pane right`
- `Horizontal Panes: Back in focused pane`
- `Horizontal Panes: Forward in focused pane`
- `Horizontal Panes: Move focused pane left` (`Cmd/Ctrl+Shift+[`)
- `Horizontal Panes: Move focused pane right` (`Cmd/Ctrl+Shift+]`)

All commands appear under the plugin category in Logseq's keymap settings and
can be assigned different shortcuts. Most start unbound; the Shift-bracket
combinations are the default pane-reordering bindings and can also be changed
or removed through Logseq.

Focus commands immediately enter edit mode. A pane with a remembered editing
position restores it; a pane that has not been edited focuses its first
editable block with the caret at the end.

## Settings

| Setting | Default | Description |
| --- | ---: | --- |
| Enable horizontal panes | On | Enables or disables the horizontal workspace. |
| Main page width | 680 px | Width of Logseq's current-page pane. |
| Pane width | 680 px | Default width of sidebar panes. |
| Main page to first pane gap | 18 px | Space between the current page and the first sidebar pane. |
| Gap between panes | 18 px | Space between adjacent sidebar panes. |
| Scroll snapping | Off | Gently aligns panes after horizontal scrolling. |
| Navigate links within panes | Off | Enables plain-click replacement and Shift-click insertion. |

## Logseq compatibility

The plugin preserves Logseq's ownership of sidebar DOM nodes. It uses CSS flex
order for pane reordering, a mutation observer to track native sidebar changes,
and Logseq's own editor for all editing. This avoids the state desynchronization
that comes from treating rendered Logseq elements as an independent window
manager.

While horizontal mode is enabled, the plugin temporarily routes the renderer's
History Back and Forward methods through the active pane. It delegates to the
original methods when no pane is active and restores the exact previous methods
when horizontal mode is disabled or the plugin unloads.

Logseq does not permit two native root panes for the same page or block. If a
navigation or history target is already open elsewhere, Horizontal Panes
focuses that pane instead of creating a duplicate. It does not consume the
source pane's history or alter the visual order.

## Development

```bash
npm run check
```

This runs the complete test suite, TypeScript type-checking, and the production
bundle build.

## License

MIT
