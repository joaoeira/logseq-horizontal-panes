import { describe, expect, it, vi } from 'vitest';
import type { IAppProxy } from '@logseq/libs/dist/LSPlugin';
import {
  registerHorizontalPaneCommands,
  type HorizontalPaneCommandActions,
} from './commands';

describe('registerHorizontalPaneCommands', () => {
  it('registers every palette command as an independently configurable shortcut', () => {
    const registrations: Array<{
      options: Parameters<IAppProxy['registerCommandPalette']>[0];
      action: Parameters<IAppProxy['registerCommandPalette']>[1];
    }> = [];
    const app = {
      registerCommandPalette(
        options: Parameters<IAppProxy['registerCommandPalette']>[0],
        action: Parameters<IAppProxy['registerCommandPalette']>[1]
      ) {
        registrations.push({ options, action });
      },
    } as Pick<IAppProxy, 'registerCommandPalette'>;
    const actions: HorizontalPaneCommandActions = {
      toggleMode: vi.fn(),
      openCurrentPage: vi.fn(),
      focusMain: vi.fn(),
      focusNext: vi.fn(),
      focusPrevious: vi.fn(),
      historyBack: vi.fn(),
      historyForward: vi.fn(),
      moveLeft: vi.fn(),
      moveRight: vi.fn(),
    };

    registerHorizontalPaneCommands(app, actions);

    expect(
      Object.fromEntries(
        registrations.map(({ options }) => [
          options.key,
          options.keybinding?.binding,
        ])
      )
    ).toEqual({
      'horizontal-panes.toggle': [],
      'horizontal-panes.open-current': [],
      'horizontal-panes.focus-main': [],
      'horizontal-panes.focus-next': [],
      'horizontal-panes.focus-previous': [],
      'horizontal-panes.history-back': [],
      'horizontal-panes.history-forward': [],
      'horizontal-panes.move-left': 'mod+shift+open-square-bracket',
      'horizontal-panes.move-right': 'mod+shift+close-square-bracket',
    });
  });
});
