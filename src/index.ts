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
  mainWidthPx: number;
  paneWidthPx: number;
  paneGapPx: number;
  mainPaneGapPx: number;
  scrollSnap: boolean;
};

const DEFAULT_SETTINGS: PluginSettings = {
  enabled: true,
  mainWidthPx: 680,
  paneWidthPx: 680,
  paneGapPx: 18,
  mainPaneGapPx: 18,
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
    key: 'mainWidthPx',
    title: 'Main page width',
    description: 'Width in pixels of Logseq’s main page.',
    type: 'number',
    default: DEFAULT_SETTINGS.mainWidthPx,
  },
  {
    key: 'paneWidthPx',
    title: 'Pane width',
    description: 'Width in pixels of pages and blocks opened as panes.',
    type: 'number',
    default: DEFAULT_SETTINGS.paneWidthPx,
  },
  {
    key: 'mainPaneGapPx',
    title: 'Main page to first pane gap',
    description: 'Horizontal space in pixels between the main page and the first pane.',
    type: 'number',
    default: DEFAULT_SETTINGS.mainPaneGapPx,
  },
  {
    key: 'paneGapPx',
    title: 'Gap between panes',
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
  const paneWidthPx = numericSetting(
    settings.paneWidthPx,
    DEFAULT_SETTINGS.paneWidthPx,
    360,
    1600
  );
  const paneGapPx = numericSetting(settings.paneGapPx, DEFAULT_SETTINGS.paneGapPx, 0, 96);

  return {
    enabled:
      typeof settings.enabled === 'boolean' ? settings.enabled : DEFAULT_SETTINGS.enabled,
    mainWidthPx: numericSetting(settings.mainWidthPx, paneWidthPx, 360, 1600),
    paneWidthPx,
    paneGapPx,
    mainPaneGapPx: numericSetting(settings.mainPaneGapPx, paneGapPx, 0, 240),
    scrollSnap:
      typeof settings.scrollSnap === 'boolean'
        ? settings.scrollSnap
        : DEFAULT_SETTINGS.scrollSnap,
  };
}

function controllerOptions(settings: PluginSettings): HorizontalPanesOptions {
  return {
    mainWidthPx: settings.mainWidthPx,
    paneWidthPx: settings.paneWidthPx,
    paneGapPx: settings.paneGapPx,
    mainPaneGapPx: settings.mainPaneGapPx,
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
    moveHorizontalPaneLeft() {
      controller.moveActivePane(-1);
    },
    moveHorizontalPaneRight() {
      controller.moveActivePane(1);
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
      label: 'Horizontal Panes: Focus pane right',
      keybinding: { binding: 'mod+l' },
    },
    () => controller.focusAdjacentPane(1)
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.focus-previous',
      label: 'Horizontal Panes: Focus pane left',
      keybinding: { binding: 'mod+j' },
    },
    () => controller.focusAdjacentPane(-1)
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.move-left',
      label: 'Horizontal Panes: Move focused pane left',
      keybinding: { binding: 'mod+shift+j' },
    },
    () => controller.moveActivePane(-1)
  );
  logseq.App.registerCommandPalette(
    {
      key: 'horizontal-panes.move-right',
      label: 'Horizontal Panes: Move focused pane right',
      keybinding: { binding: 'mod+shift+l' },
    },
    () => controller.moveActivePane(1)
  );

  logseq.beforeunload(async () => {
    controller.destroy();
  });
}

logseq.ready(main).catch((error: unknown) => {
  console.error('Horizontal Panes failed to start', error);
});
