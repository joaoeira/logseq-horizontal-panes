import type {
  IAppProxy,
  SimpleCommandCallback,
  SimpleCommandKeybinding,
} from '@logseq/libs/dist/LSPlugin';

type CommandPaletteApp = Pick<IAppProxy, 'registerCommandPalette'>;

export type HorizontalPaneCommandActions = {
  toggleMode: SimpleCommandCallback;
  openCurrentPage: SimpleCommandCallback;
  focusMain: SimpleCommandCallback;
  focusNext: SimpleCommandCallback;
  focusPrevious: SimpleCommandCallback;
  historyBack: SimpleCommandCallback;
  historyForward: SimpleCommandCallback;
  moveLeft: SimpleCommandCallback;
  moveRight: SimpleCommandCallback;
};

const UNBOUND_KEYBINDING: SimpleCommandKeybinding = {
  mode: 'global',
  binding: [],
};

const MOVE_LEFT_KEYBINDING: SimpleCommandKeybinding = {
  mode: 'global',
  binding: 'mod+shift+open-square-bracket',
};

const MOVE_RIGHT_KEYBINDING: SimpleCommandKeybinding = {
  mode: 'global',
  binding: 'mod+shift+close-square-bracket',
};

export function registerHorizontalPaneCommands(
  app: CommandPaletteApp,
  actions: HorizontalPaneCommandActions
): void {
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.toggle',
      label: 'Horizontal Panes: Toggle mode',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.toggleMode
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.open-current',
      label: 'Horizontal Panes: Open current page as pane',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.openCurrentPage
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-main',
      label: 'Horizontal Panes: Focus main page',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.focusMain
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-next',
      label: 'Horizontal Panes: Focus pane right',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.focusNext
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-previous',
      label: 'Horizontal Panes: Focus pane left',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.focusPrevious
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.history-back',
      label: 'Horizontal Panes: Back in focused pane',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.historyBack
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.history-forward',
      label: 'Horizontal Panes: Forward in focused pane',
      keybinding: UNBOUND_KEYBINDING,
    },
    actions.historyForward
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.move-left',
      label: 'Horizontal Panes: Move focused pane left',
      keybinding: MOVE_LEFT_KEYBINDING,
    },
    actions.moveLeft
  );
  app.registerCommandPalette(
    {
      key: 'horizontal-panes.move-right',
      label: 'Horizontal Panes: Move focused pane right',
      keybinding: MOVE_RIGHT_KEYBINDING,
    },
    actions.moveRight
  );
}
