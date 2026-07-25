export const HORIZONTAL_PANES_STYLES = String.raw`
@media (min-width: 721px) {
  body.horizontal-panes-active {
    --horizontal-panes-main-width: 680px;
    --horizontal-panes-pane-width: 680px;
    --horizontal-panes-last-pane-max-width: 850px;
    --horizontal-panes-gap: 18px;
    --horizontal-panes-main-gap: 18px;
    --horizontal-panes-header-height: 48px;
    overflow: hidden !important;
  }

  body.horizontal-panes-active #app-container {
    align-items: stretch;
    height: 100vh;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    overscroll-behavior-x: contain;
    scroll-behavior: smooth;
    scrollbar-color: color-mix(in srgb, var(--ls-primary-text-color) 35%, transparent) transparent;
    scrollbar-width: thin;
    background: var(--ls-secondary-background-color);
  }

  body.horizontal-panes-active.horizontal-panes-snap #app-container {
    scroll-snap-type: x proximity;
  }

  body.horizontal-panes-active.horizontal-panes-pane-resizing #app-container {
    scroll-behavior: auto;
    scroll-snap-type: none !important;
  }

  body.horizontal-panes-pane-resize-target,
  body.horizontal-panes-pane-resize-target * {
    cursor: col-resize !important;
  }

  body.horizontal-panes-pane-resizing,
  body.horizontal-panes-pane-resizing * {
    cursor: col-resize !important;
    user-select: none !important;
  }

  body.horizontal-panes-active #app-container::-webkit-scrollbar {
    height: 10px;
  }

  body.horizontal-panes-active #app-container::-webkit-scrollbar-track {
    background: transparent;
  }

  body.horizontal-panes-active #app-container::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--ls-primary-text-color) 35%, transparent);
    border: 3px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
  }

  body.horizontal-panes-active #left-container {
    box-sizing: border-box !important;
    flex: 0 0 var(--horizontal-panes-main-width) !important;
    width: var(--horizontal-panes-main-width) !important;
    min-width: var(--horizontal-panes-main-width) !important;
    max-width: var(--horizontal-panes-main-width) !important;
    height: 100vh;
    padding-top: var(--horizontal-panes-header-height) !important;
    scroll-snap-align: start;
    background: var(--ls-primary-background-color);
  }

  body.horizontal-panes-active #left-container > .cp__header {
    box-sizing: border-box;
    position: fixed !important;
    inset: 0 0 auto 0 !important;
    z-index: 50;
    width: 100vw !important;
    min-width: 100vw !important;
    max-width: none !important;
  }

  body.horizontal-panes-active #right-sidebar.open {
    display: block !important;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: max(
      0px,
      calc(100vw - var(--horizontal-panes-main-width))
    ) !important;
    max-width: none !important;
    height: 100vh !important;
    overflow: visible !important;
    border: 0 !important;
    background: transparent !important;
  }

  body.horizontal-panes-active #right-sidebar > .resizer {
    display: none !important;
  }

  body.horizontal-panes-active #right-sidebar-container,
  body.horizontal-panes-active .cp__right-sidebar-scrollable {
    display: block !important;
    width: max-content !important;
    min-width: max(
      0px,
      calc(100vw - var(--horizontal-panes-main-width))
    ) !important;
    max-width: none !important;
    height: 100vh !important;
    overflow: visible !important;
    background: transparent !important;
  }

  body.horizontal-panes-active .cp__right-sidebar-topbar {
    display: none !important;
  }

  body.horizontal-panes-active .sidebar-item-list {
    box-sizing: border-box;
    display: flex !important;
    flex: none !important;
    flex-flow: row nowrap !important;
    align-items: flex-start !important;
    align-content: flex-start !important;
    gap: var(--horizontal-panes-gap) !important;
    width: max-content !important;
    min-width: max(
      0px,
      calc(100vw - var(--horizontal-panes-main-width))
    ) !important;
    height: 100vh !important;
    margin: 0 !important;
    padding:
      calc(var(--horizontal-panes-header-height) + 18px)
      48px
      28px
      var(--horizontal-panes-main-gap) !important;
    overflow: visible !important;
    background: var(--ls-secondary-background-color) !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-drop-indicator,
  body.horizontal-panes-active .sidebar-item-list .sidebar-item-drop-area {
    display: none !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item {
    box-sizing: border-box;
    position: relative;
    display: flex !important;
    flex: 0 0 var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    align-self: flex-start !important;
    width: var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    min-width: var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    max-width: var(
      --horizontal-panes-pane-width-override,
      var(--horizontal-panes-pane-width)
    ) !important;
    height: calc(100vh - var(--horizontal-panes-header-height) - 46px) !important;
    min-height: 0 !important;
    max-height: calc(100vh - var(--horizontal-panes-header-height) - 46px) !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scroll-snap-align: start;
    user-select: text;
    border: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 12%, transparent);
    border-radius: 10px;
    background: var(--ls-primary-background-color);
    box-shadow: 0 8px 26px color-mix(in srgb, #000 14%, transparent);
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  body.horizontal-panes-active
    .sidebar-item-list
    > .sidebar-item.horizontal-panes-last-pane:not(.collapsed):not(.horizontal-panes-manual-width) {
    flex: 1 1 var(--horizontal-panes-pane-width) !important;
    max-width: var(--horizontal-panes-last-pane-max-width) !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item.horizontal-panes-resize-target {
    border-right-color: var(--ls-link-text-color, var(--ls-active-primary-color));
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item.horizontal-panes-active-pane {
    border-color: var(--ls-link-text-color, var(--ls-active-primary-color));
    box-shadow:
      0 0 0 1px var(--ls-link-text-color, var(--ls-active-primary-color)),
      0 8px 26px color-mix(in srgb, #000 16%, transparent);
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item > div {
    min-width: 0;
  }

  body.horizontal-panes-active .sidebar-item .sidebar-item-header {
    position: sticky !important;
    top: 0;
    z-index: 20;
    min-height: 42px;
    background: color-mix(
      in srgb,
      var(--ls-secondary-background-color) 92%,
      transparent
    ) !important;
    border-bottom: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 10%, transparent);
    backdrop-filter: blur(12px);
  }

  body.horizontal-panes-active .horizontal-panes-history-controls {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin: 0;
    padding: 6px;
    color: var(--ls-secondary-text-color);
    border: 0;
    border-radius: 5px;
    background: transparent;
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button:hover:not(:disabled) {
    color: var(--ls-primary-text-color);
    background: color-mix(in srgb, var(--ls-primary-text-color) 8%, transparent);
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  body.horizontal-panes-active .horizontal-panes-history-controls > button > svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  body.horizontal-panes-active .sidebar-item .sidebar-panel-content {
    padding-bottom: 72px;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item.collapsed {
    flex-basis: 48px !important;
    width: 48px !important;
    min-width: 48px !important;
    max-width: 48px !important;
    overflow: hidden !important;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .sidebar-item-header {
    box-sizing: border-box;
    display: flex !important;
    width: 48px;
    height: 100%;
    min-height: 100%;
    align-items: flex-start;
    border: 0;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .sidebar-item-header > button:first-child {
    width: 48px !important;
    height: 100%;
    padding: 10px 7px !important;
    align-items: flex-start !important;
    writing-mode: vertical-rl;
    text-orientation: mixed;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .sidebar-item-header .item-actions {
    display: none !important;
  }

  body.horizontal-panes-active .sidebar-item.collapsed .horizontal-panes-history-controls {
    display: none !important;
  }
}
`;
