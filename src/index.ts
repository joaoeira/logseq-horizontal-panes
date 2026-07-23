import type {
  LSPluginUser,
  PageEntity,
  SettingSchemaDesc,
} from '@logseq/libs/dist/LSPlugin.user';
import { HorizontalPanesController, type HorizontalPanesOptions } from './controller';
import { HORIZONTAL_PANES_STYLES } from './styles';

declare const logseq: LSPluginUser;

type PluginSettings = {
  enabled: boolean;
  paneWidthPx: number;
  paneGapPx: number;
  scrollSnap: boolean;
};

const DEFAULT_SETTINGS: PluginSettings = {
  enabled: true,
  paneWidthPx: 680,
  paneGapPx: 18,
  scrollSnap: false,
};

const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'enabled',
    title: 'Enable horizontal panes',
    description: 'Lay out the main page and right-sidebar pages in one horizontal strip.',
    type: 'boolean',
    default: DEFAULT_SETTINGS.enabled,
  },
  {
    key: 'paneWidthPx',
    title: 'Pane width',
    description: 'Width in pixels of the main page and every pane in the horizontal strip.',
    type: 'number',
    default: DEFAULT_SETTINGS.paneWidthPx,
  },
  {
    key: 'paneGapPx',
    title: 'Pane gap',
    description: 'Horizontal space in pixels between panes.',
    type: 'number',
    default: DEFAULT_SETTINGS.paneGapPx,
  },
  {
    key: 'scrollSnap',
    title: 'Scroll snapping',
    description: 'Gently align a pane with the left edge after horizontal scrolling.',
    type: 'boolean',
    default: DEFAULT_SETTINGS.scrollSnap,
  },
];

function numericSetting(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

function readSettings(): PluginSettings {
  const settings = (logseq.settings ?? {}) as Partial<PluginSettings>;

  return {
    enabled:
      typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_SETTINGS.enabled,
    paneWidthPx: numericSetting(settings.paneWidthPx, DEFAULT_SETTINGS.paneWidthPx, 360, 1600),
    paneGapPx: numericSetting(settings.paneGapPx, DEFAULT_SETTINGS.paneGapPx, 0, 96),
    scrollSnap:
      typeof settings.scrollSnap === 'boolean'
        ? settings.scrollSnap
        : DEFAULT_SETTINGS.scrollSnap,
  };
}

function controllerOptions(settings: PluginSettings): HorizontalPanesOptions {
  return {
    paneWidthPx: settings.paneWidthPx,
    paneGapPx: settings.paneGapPx,
    scrollSnap: settings.scrollSnap,
  };
}

async function openCurrentPageInPane(): Promise<void> {
  const page = (await logseq.Editor.getCurrentPage()) as PageEntity | null;
  const pageIdentity = page?.uuid ?? page?.id;

  if (pageIdentity === undefined || pageIdentity === null) {
    await logseq.UI.showMsg('Horizontal Panes: no current page to open', 'warning');
    return;
  }

  await logseq.App.setRightSidebarVisible(true);
  logseq.Editor.openInRightSidebar(pageIdentity);
}

async function main(): Promise<void> {
  logseq.useSettingsSchema(settingsSchema);
  logseq.provideStyle(HORIZONTAL_PANES_STYLES);

  const initialSettings = readSettings();
  const controller = new HorizontalPanesController(controllerOptions(initialSettings));
  controller.setEnabled(initialSettings.enabled);

  const applySettings = (): void => {
    const settings = readSettings();
    controller.setOptions(controllerOptions(settings));
    controller.setEnabled(settings.enabled);
  };

  const toggleMode = async (): Promise<void> => {
    const enabled = !controller.isEnabled();
    controller.setEnabled(enabled);
    await logseq.updateSettings({ enabled });
  };

  logseq.onSettingsChanged(applySettings);
  logseq.App.onRouteChanged(() => {
    if (controller.isEnabled()) {
      controller.focusMain();
    }
  });

  logseq.provideModel({
    async toggleHorizontalPanes() {
      await toggleMode();
    },
    focusHorizontalPanesMain() {
      controller.focusMain();
    },
    focusHorizontalPanesNext() {
      controller.focusAdjacentPane(1);
    },
    focusHorizontalPanesPrevious() {
      controller.focusAdjacentPane(-1);
    },
    async openCurrentPageInHorizontalPane() {
      await openCurrentPageInPane();
    },
  });

  logseq.App.registerUIItem('toolbar', {
    key: 'horizontal-panes-toggle',
    template: `
      <a
        class="button"
        data-on-click="toggleHorizontalPanes"
        title="Toggle horizontal panes"
        aria-label="Toggle horizontal panes"
      >
        <i class="ti ti-layout-columns"></i>
      </a>
    `,
  });

  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.toggle',
      label: 'Horizontal Panes: Toggle mode',
    },
    toggleMode
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.open-current',
      label: 'Horizontal Panes: Open current page as pane',
    },
    openCurrentPageInPane
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-main',
      label: 'Horizontal Panes: Focus main page',
    },
    () => controller.focusMain()
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-next',
      label: 'Horizontal Panes: Focus next pane',
      keybinding: { binding: 'mod+alt+right' },
    },
    () => controller.focusAdjacentPane(1)
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-previous',
      label: 'Horizontal Panes: Focus previous pane',
      keybinding: { binding: 'mod+alt+left' },
    },
    () => controller.focusAdjacentPane(-1)
  );

  logseq.beforeunload(async () => {
    controller.destroy();
  });
}

logseq.ready(main).catch((error: unknown) => {
  console.error('Horizontal Panes failed to start', error);
});
