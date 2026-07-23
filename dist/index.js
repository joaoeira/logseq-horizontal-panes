"use strict";
(() => {
  // src/geometry.ts
  function shouldRemapWheelToHorizontal(input) {
    return input.shiftKey && Math.abs(input.deltaY) > Math.abs(input.deltaX);
  }
  function scrollLeftForElement(container, element, currentScrollLeft, leadingGap) {
    const nextLeft = currentScrollLeft + element.left - container.left - leadingGap;
    return Math.max(0, Math.round(nextLeft));
  }

  // src/controller.ts
  var BODY_CLASS = "horizontal-panes-active";
  var SNAP_CLASS = "horizontal-panes-snap";
  var ACTIVE_PANE_CLASS = "horizontal-panes-active-pane";
  var SIDEBAR_LIST_SELECTOR = ".sidebar-item-list";
  var PANE_SELECTOR = ":scope > .sidebar-item";
  var APP_CONTAINER_SELECTOR = "#app-container";
  var MAIN_CONTAINER_SELECTOR = "#left-container";
  var HorizontalPanesController = class {
    enabled = false;
    options;
    sidebarList = null;
    sidebarObserver = null;
    sidebarPoll = null;
    paneScrollListeners = /* @__PURE__ */ new Set();
    paneOrder = [];
    pendingFocusFrame = null;
    constructor(options) {
      this.options = options;
    }
    setOptions(options) {
      this.options = options;
      this.applyCssVariables();
    }
    setEnabled(nextEnabled) {
      if (nextEnabled === this.enabled) {
        this.applyCssVariables();
        return;
      }
      this.enabled = nextEnabled;
      if (nextEnabled) {
        this.activate();
      } else {
        this.deactivate();
      }
    }
    isEnabled() {
      return this.enabled;
    }
    focusMain(behavior = "smooth") {
      const appContainer = this.getAppContainer();
      appContainer?.scrollTo({ left: 0, behavior });
      this.clearActivePane();
    }
    focusAdjacentPane(direction) {
      const panes = this.getPanes();
      if (panes.length === 0) {
        this.focusMain();
        return;
      }
      const activeIndex = panes.findIndex((pane) => pane.classList.contains(ACTIVE_PANE_CLASS));
      if (activeIndex === -1) {
        if (direction < 0) {
          this.focusMain();
        } else {
          const firstPane = panes[0];
          if (firstPane) {
            this.focusPane(firstPane);
          }
        }
        return;
      }
      const nextIndex = activeIndex + direction;
      if (nextIndex < 0) {
        this.focusMain();
        return;
      }
      const nextPane = panes[Math.min(nextIndex, panes.length - 1)];
      if (nextPane) {
        this.focusPane(nextPane);
      }
    }
    moveActivePane(direction) {
      const panes = this.getPanes();
      const activeIndex = panes.findIndex((pane) => pane.classList.contains(ACTIVE_PANE_CLASS));
      if (activeIndex === -1) return false;
      const targetIndex = activeIndex + direction;
      if (targetIndex < 0 || targetIndex >= panes.length) return false;
      const activePane = panes[activeIndex];
      const targetPane = panes[targetIndex];
      if (!activePane || !targetPane) return false;
      panes[activeIndex] = targetPane;
      panes[targetIndex] = activePane;
      this.paneOrder = panes;
      this.applyPaneOrder();
      this.scheduleFocus(activePane);
      return true;
    }
    destroy() {
      this.enabled = false;
      this.deactivate();
    }
    activate() {
      const body = this.getDocument().body;
      body.classList.add(BODY_CLASS);
      body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
      this.applyCssVariables();
      this.getDocument().addEventListener("wheel", this.handleWheel, {
        capture: true,
        passive: false
      });
      this.getDocument().addEventListener("pointerdown", this.handlePointerDown, true);
      this.ensureSidebarList(false);
      this.sidebarPoll = window.setInterval(() => this.ensureSidebarList(true), 400);
    }
    deactivate() {
      const document = this.getDocument();
      document.body.classList.remove(BODY_CLASS, SNAP_CLASS);
      document.body.style.removeProperty("--horizontal-panes-main-width");
      document.body.style.removeProperty("--horizontal-panes-pane-width");
      document.body.style.removeProperty("--horizontal-panes-gap");
      document.body.style.removeProperty("--horizontal-panes-main-gap");
      document.removeEventListener("wheel", this.handleWheel, true);
      document.removeEventListener("pointerdown", this.handlePointerDown, true);
      if (this.sidebarPoll !== null) {
        window.clearInterval(this.sidebarPoll);
        this.sidebarPoll = null;
      }
      if (this.pendingFocusFrame !== null) {
        window.cancelAnimationFrame(this.pendingFocusFrame);
        this.pendingFocusFrame = null;
      }
      this.disconnectSidebarList();
      this.focusMain("auto");
    }
    applyCssVariables() {
      if (!this.enabled) return;
      const body = this.getDocument().body;
      body.style.setProperty("--horizontal-panes-main-width", `${this.options.mainWidthPx}px`);
      body.style.setProperty("--horizontal-panes-pane-width", `${this.options.paneWidthPx}px`);
      body.style.setProperty("--horizontal-panes-gap", `${this.options.paneGapPx}px`);
      body.style.setProperty("--horizontal-panes-main-gap", `${this.options.mainPaneGapPx}px`);
      body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
    }
    ensureSidebarList(focusNewestWhenAttached) {
      const nextList = this.getDocument().querySelector(SIDEBAR_LIST_SELECTOR);
      if (nextList === this.sidebarList && nextList?.isConnected) return;
      this.disconnectSidebarList();
      if (!nextList) return;
      this.sidebarList = nextList;
      this.sidebarObserver = new MutationObserver(this.handleSidebarMutations);
      this.sidebarObserver.observe(nextList, { childList: true });
      this.paneOrder = this.getNativePanes().reverse();
      this.applyPaneOrder();
      this.getPanes().forEach((pane) => this.attachPaneScrollListener(pane));
      if (focusNewestWhenAttached) {
        const panes = this.getPanes();
        const newestPane = panes.at(-1);
        if (newestPane) {
          this.scheduleFocus(newestPane);
        }
      }
    }
    disconnectSidebarList() {
      this.sidebarObserver?.disconnect();
      this.sidebarObserver = null;
      this.paneScrollListeners.forEach((pane) => {
        pane.removeEventListener("scroll", this.handlePaneScroll);
        pane.classList.remove(ACTIVE_PANE_CLASS);
        pane.style.removeProperty("order");
      });
      this.paneScrollListeners.clear();
      this.paneOrder = [];
      this.sidebarList = null;
    }
    handleSidebarMutations = (mutations) => {
      const addedPanes = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof this.getWindow().Element)) continue;
          const element = node;
          if (element.matches(".sidebar-item")) {
            addedPanes.add(element);
          }
          element.querySelectorAll(".sidebar-item").forEach((pane) => addedPanes.add(pane));
        }
      }
      const nativePanes = this.getNativePanes();
      const currentPanes = new Set(nativePanes);
      this.paneScrollListeners.forEach((pane) => {
        if (currentPanes.has(pane)) return;
        pane.removeEventListener("scroll", this.handlePaneScroll);
        pane.classList.remove(ACTIVE_PANE_CLASS);
        pane.style.removeProperty("order");
        this.paneScrollListeners.delete(pane);
      });
      const retainedOrder = this.paneOrder.filter(
        (pane) => currentPanes.has(pane) && !addedPanes.has(pane)
      );
      const appendedOrder = nativePanes.filter((pane) => addedPanes.has(pane) || !retainedOrder.includes(pane)).reverse();
      this.paneOrder = [...retainedOrder, ...appendedOrder];
      this.applyPaneOrder();
      this.paneOrder.forEach((pane) => this.attachPaneScrollListener(pane));
      const newestPane = nativePanes.find((pane) => addedPanes.has(pane));
      if (newestPane) {
        this.scheduleFocus(newestPane);
      }
    };
    scheduleFocus(pane) {
      if (this.pendingFocusFrame !== null) {
        window.cancelAnimationFrame(this.pendingFocusFrame);
      }
      this.pendingFocusFrame = window.requestAnimationFrame(() => {
        this.pendingFocusFrame = window.requestAnimationFrame(() => {
          this.pendingFocusFrame = null;
          if (pane.isConnected && this.enabled) {
            this.focusPane(pane);
          }
        });
      });
    }
    focusPane(pane) {
      const appContainer = this.getAppContainer();
      if (!appContainer) return;
      this.markActivePane(pane);
      const nextLeft = scrollLeftForElement(
        appContainer.getBoundingClientRect(),
        pane.getBoundingClientRect(),
        appContainer.scrollLeft,
        this.options.paneGapPx
      );
      appContainer.scrollTo({ left: nextLeft, behavior: "smooth" });
    }
    markActivePane(pane) {
      this.clearActivePane();
      pane.classList.add(ACTIVE_PANE_CLASS);
    }
    clearActivePane() {
      this.sidebarList?.querySelectorAll(`.${ACTIVE_PANE_CLASS}`).forEach((pane) => pane.classList.remove(ACTIVE_PANE_CLASS));
    }
    attachPaneScrollListener(pane) {
      if (this.paneScrollListeners.has(pane)) return;
      pane.addEventListener("scroll", this.handlePaneScroll, { passive: true });
      this.paneScrollListeners.add(pane);
    }
    handlePaneScroll = () => {
      this.sidebarList?.dispatchEvent(new Event("scroll"));
    };
    handleWheel = (event) => {
      if (!this.enabled || !shouldRemapWheelToHorizontal({
        shiftKey: event.shiftKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY
      })) {
        return;
      }
      const appContainer = this.getAppContainer();
      if (!appContainer) return;
      event.preventDefault();
      appContainer.scrollLeft += event.deltaY;
    };
    handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof this.getWindow().Element)) return;
      const targetElement = target;
      const pane = targetElement.closest(".sidebar-item");
      if (pane && this.sidebarList?.contains(pane)) {
        this.markActivePane(pane);
        return;
      }
      if (targetElement.closest(MAIN_CONTAINER_SELECTOR)) {
        this.clearActivePane();
      }
    };
    getPanes() {
      if (!this.sidebarList) return [];
      const currentPanes = new Set(this.getNativePanes());
      this.paneOrder = this.paneOrder.filter((pane) => currentPanes.has(pane));
      return [...this.paneOrder];
    }
    getNativePanes() {
      if (!this.sidebarList) return [];
      return Array.from(this.sidebarList.querySelectorAll(PANE_SELECTOR));
    }
    applyPaneOrder() {
      this.paneOrder.forEach((pane, index) => {
        pane.style.order = String(index);
      });
    }
    getAppContainer() {
      return this.getDocument().querySelector(APP_CONTAINER_SELECTOR);
    }
    getDocument() {
      return parent.document;
    }
    getWindow() {
      return parent;
    }
  };

  // src/styles.ts
  var HORIZONTAL_PANES_STYLES = String.raw`
@media (min-width: 721px) {
  body.horizontal-panes-active {
    --horizontal-panes-main-width: 680px;
    --horizontal-panes-pane-width: 680px;
    --horizontal-panes-gap: 18px;
    --horizontal-panes-main-gap: 18px;
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
  }

  body.horizontal-panes-active.horizontal-panes-snap #app-container {
    scroll-snap-type: x proximity;
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
    flex: 0 0 var(--horizontal-panes-main-width) !important;
    width: var(--horizontal-panes-main-width) !important;
    min-width: var(--horizontal-panes-main-width) !important;
    max-width: var(--horizontal-panes-main-width) !important;
    height: 100vh;
    scroll-snap-align: start;
  }

  body.horizontal-panes-active #right-sidebar.open {
    display: block !important;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: 0 !important;
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
    min-width: max-content !important;
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
    min-width: max-content !important;
    height: 100vh !important;
    margin: 0 !important;
    padding: 18px 48px 28px var(--horizontal-panes-main-gap) !important;
    overflow: visible !important;
    background: var(--ls-primary-background-color) !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-drop-indicator,
  body.horizontal-panes-active .sidebar-item-list .sidebar-item-drop-area {
    display: none !important;
  }

  body.horizontal-panes-active .sidebar-item-list > .sidebar-item {
    box-sizing: border-box;
    position: relative;
    display: flex !important;
    flex: 0 0 var(--horizontal-panes-pane-width) !important;
    align-self: flex-start !important;
    width: var(--horizontal-panes-pane-width) !important;
    min-width: var(--horizontal-panes-pane-width) !important;
    max-width: var(--horizontal-panes-pane-width) !important;
    height: calc(100vh - 46px) !important;
    min-height: 0 !important;
    max-height: calc(100vh - 46px) !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scroll-snap-align: start;
    user-select: text;
    border: 1px solid color-mix(in srgb, var(--ls-primary-text-color) 12%, transparent);
    border-radius: 10px;
    background: var(--ls-secondary-background-color);
    box-shadow: 0 8px 26px color-mix(in srgb, #000 14%, transparent);
    transition: border-color 120ms ease, box-shadow 120ms ease;
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
}
`;

  // src/index.ts
  var DEFAULT_SETTINGS = {
    enabled: true,
    mainWidthPx: 680,
    paneWidthPx: 680,
    paneGapPx: 18,
    mainPaneGapPx: 18,
    scrollSnap: false
  };
  var settingsSchema = [
    {
      key: "enabled",
      title: "Enable horizontal panes",
      description: "Lay out the main page and right-sidebar pages in one horizontal strip.",
      type: "boolean",
      default: DEFAULT_SETTINGS.enabled
    },
    {
      key: "mainWidthPx",
      title: "Main page width",
      description: "Width in pixels of Logseq\u2019s main page.",
      type: "number",
      default: DEFAULT_SETTINGS.mainWidthPx
    },
    {
      key: "paneWidthPx",
      title: "Pane width",
      description: "Width in pixels of pages and blocks opened as panes.",
      type: "number",
      default: DEFAULT_SETTINGS.paneWidthPx
    },
    {
      key: "mainPaneGapPx",
      title: "Main page to first pane gap",
      description: "Horizontal space in pixels between the main page and the first pane.",
      type: "number",
      default: DEFAULT_SETTINGS.mainPaneGapPx
    },
    {
      key: "paneGapPx",
      title: "Gap between panes",
      description: "Horizontal space in pixels between panes.",
      type: "number",
      default: DEFAULT_SETTINGS.paneGapPx
    },
    {
      key: "scrollSnap",
      title: "Scroll snapping",
      description: "Gently align a pane with the left edge after horizontal scrolling.",
      type: "boolean",
      default: DEFAULT_SETTINGS.scrollSnap
    }
  ];
  function numericSetting(value, fallback, minimum, maximum) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
  }
  function readSettings() {
    const settings = logseq.settings ?? {};
    const paneWidthPx = numericSetting(
      settings.paneWidthPx,
      DEFAULT_SETTINGS.paneWidthPx,
      360,
      1600
    );
    const paneGapPx = numericSetting(settings.paneGapPx, DEFAULT_SETTINGS.paneGapPx, 0, 96);
    return {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : DEFAULT_SETTINGS.enabled,
      mainWidthPx: numericSetting(settings.mainWidthPx, paneWidthPx, 360, 1600),
      paneWidthPx,
      paneGapPx,
      mainPaneGapPx: numericSetting(settings.mainPaneGapPx, paneGapPx, 0, 240),
      scrollSnap: typeof settings.scrollSnap === "boolean" ? settings.scrollSnap : DEFAULT_SETTINGS.scrollSnap
    };
  }
  function controllerOptions(settings) {
    return {
      mainWidthPx: settings.mainWidthPx,
      paneWidthPx: settings.paneWidthPx,
      paneGapPx: settings.paneGapPx,
      mainPaneGapPx: settings.mainPaneGapPx,
      scrollSnap: settings.scrollSnap
    };
  }
  async function openCurrentPageInPane() {
    const page = await logseq.Editor.getCurrentPage();
    const pageIdentity = page?.uuid ?? page?.id;
    if (pageIdentity === void 0 || pageIdentity === null) {
      await logseq.UI.showMsg("Horizontal Panes: no current page to open", "warning");
      return;
    }
    await logseq.App.setRightSidebarVisible(true);
    logseq.Editor.openInRightSidebar(pageIdentity);
  }
  async function main() {
    logseq.useSettingsSchema(settingsSchema);
    logseq.provideStyle(HORIZONTAL_PANES_STYLES);
    const initialSettings = readSettings();
    const controller = new HorizontalPanesController(controllerOptions(initialSettings));
    controller.setEnabled(initialSettings.enabled);
    const applySettings = () => {
      const settings = readSettings();
      controller.setOptions(controllerOptions(settings));
      controller.setEnabled(settings.enabled);
    };
    const toggleMode = async () => {
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
      }
    });
    logseq.App.registerUIItem("toolbar", {
      key: "horizontal-panes-toggle",
      template: `
      <a
        class="button"
        data-on-click="toggleHorizontalPanes"
        title="Toggle horizontal panes"
        aria-label="Toggle horizontal panes"
      >
        <i class="ti ti-layout-columns"></i>
      </a>
    `
    });
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.toggle",
        label: "Horizontal Panes: Toggle mode"
      },
      toggleMode
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.open-current",
        label: "Horizontal Panes: Open current page as pane"
      },
      openCurrentPageInPane
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.focus-main",
        label: "Horizontal Panes: Focus main page"
      },
      () => controller.focusMain()
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.focus-next",
        label: "Horizontal Panes: Focus pane right",
        keybinding: { binding: "mod+l" }
      },
      () => controller.focusAdjacentPane(1)
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.focus-previous",
        label: "Horizontal Panes: Focus pane left",
        keybinding: { binding: "mod+j" }
      },
      () => controller.focusAdjacentPane(-1)
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.move-left",
        label: "Horizontal Panes: Move focused pane left",
        keybinding: { binding: "mod+shift+j" }
      },
      () => controller.moveActivePane(-1)
    );
    logseq.App.registerCommandPalette(
      {
        key: "horizontal-panes.move-right",
        label: "Horizontal Panes: Move focused pane right",
        keybinding: { binding: "mod+shift+l" }
      },
      () => controller.moveActivePane(1)
    );
    logseq.beforeunload(async () => {
      controller.destroy();
    });
  }
  logseq.ready(main).catch((error) => {
    console.error("Horizontal Panes failed to start", error);
  });
})();
