import { scrollLeftForElement, shouldRemapWheelToHorizontal } from './geometry';

const BODY_CLASS = 'horizontal-panes-active';
const SNAP_CLASS = 'horizontal-panes-snap';
const ACTIVE_PANE_CLASS = 'horizontal-panes-active-pane';
const LAST_PANE_CLASS = 'horizontal-panes-last-pane';
const MANUAL_WIDTH_CLASS = 'horizontal-panes-manual-width';
const RESIZE_TARGET_CLASS = 'horizontal-panes-resize-target';
const RESIZE_TARGET_BODY_CLASS = 'horizontal-panes-pane-resize-target';
const RESIZING_BODY_CLASS = 'horizontal-panes-pane-resizing';
const HISTORY_CONTROLS_CLASS = 'horizontal-panes-history-controls';
const SIDEBAR_LIST_SELECTOR = '.sidebar-item-list';
const PANE_SELECTOR = ':scope > .sidebar-item';
const APP_CONTAINER_SELECTOR = '#app-container';
const MAIN_CONTAINER_SELECTOR = '#left-container';
const BLOCK_SELECTOR = '.ls-block';
const MIN_PANE_WIDTH_PX = 360;
const MAX_PANE_WIDTH_PX = 1600;
const RESIZE_TARGET_INSIDE_PX = 4;
const RESIZE_TARGET_OUTSIDE_PX = 8;
const EDITOR_SELECTOR = [
  '.block-editor textarea',
  'textarea.block-editor',
  '.editor-inner textarea',
  '.block-editor input',
  '.block-editor [contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
].join(', ');
const BLOCK_ACTIVATOR_SELECTORS = [
  '.block-title-wrap',
  '.block-content-inner',
  '.block-content',
] as const;

type EditorBookmark = {
  block: HTMLElement | null;
  blockId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
};

type PaneHistoryEntry = {
  target: PaneReferenceTarget;
  reference?: string;
  scrollTop?: number;
  editorBookmark?: Omit<EditorBookmark, 'block'>;
};

type PaneHistorySession = {
  entries: PaneHistoryEntry[];
  index: number;
};

type HistoryRouting = {
  history: History;
  backDescriptor: PropertyDescriptor | undefined;
  forwardDescriptor: PropertyDescriptor | undefined;
  backWrapper: History['back'];
  forwardWrapper: History['forward'];
};

type PaneResizeState = {
  pane: HTMLElement;
  pointerId: number;
  startClientX: number;
  startWidth: number;
  captureTarget: Element | null;
};

type PaneReferenceActivation = {
  pane: HTMLElement;
  reference: string;
};

type PaneBlockActivation = {
  pane: HTMLElement;
  blockId: string;
};

type PaneReferenceAction = 'replace' | 'insert';

type PendingReferencePointer = PaneReferenceActivation & {
  action: PaneReferenceAction;
  pointerId: number;
};

type PendingBlockPointer = PaneBlockActivation & {
  action: PaneReferenceAction;
  pointerId: number;
};

type PendingPaneInsertion = {
  action: PaneReferenceAction;
  sourcePane: HTMLElement;
  existingPanes: Set<HTMLElement>;
  replacementPane: HTMLElement | null;
  replacementHistory: PaneHistorySession | null;
  timeout: number | null;
  resolve: () => void;
};

export type PaneReferenceTarget = string | number;

export type HorizontalPanesOptions = {
  mainWidthPx: number;
  paneWidthPx: number;
  paneGapPx: number;
  mainPaneGapPx: number;
  scrollSnap: boolean;
  openPaneLinks: boolean;
};

export type HorizontalPanesHost = {
  commitCurrentEditor?: () => Promise<void>;
  resolvePaneReference?: (reference: string) => Promise<PaneReferenceTarget | null>;
  openPaneReference?: (target: PaneReferenceTarget) => Promise<void>;
};

export class HorizontalPanesController {
  private enabled = false;
  private options: HorizontalPanesOptions;
  private readonly host: HorizontalPanesHost;
  private sidebarList: HTMLElement | null = null;
  private sidebarObserver: MutationObserver | null = null;
  private sidebarPoll: number | null = null;
  private paneScrollListeners = new Set<HTMLElement>();
  private paneOrder: HTMLElement[] = [];
  private pendingFocusFrame: number | null = null;
  private pendingEditorFrame: number | null = null;
  private pendingOutgoingCommit: Promise<void> | null = null;
  private editorRestoreGeneration = 0;
  private editorBookmarks = new WeakMap<HTMLElement, EditorBookmark>();
  private resizeTargetPane: HTMLElement | null = null;
  private paneResize: PaneResizeState | null = null;
  private paneHistories = new WeakMap<HTMLElement, PaneHistorySession>();
  private pendingReferencePointer: PendingReferencePointer | null = null;
  private pendingBlockPointer: PendingBlockPointer | null = null;
  private suppressedReferenceClick: PaneReferenceActivation | null = null;
  private suppressedReferenceClickTimer: number | null = null;
  private suppressedBlockClick: PaneBlockActivation | null = null;
  private suppressedBlockClickTimer: number | null = null;
  private pendingPaneInsertion: PendingPaneInsertion | null = null;
  private referenceOpenQueue: Promise<void> = Promise.resolve();
  private historyRouting: HistoryRouting | null = null;

  constructor(options: HorizontalPanesOptions, host: HorizontalPanesHost = {}) {
    this.options = options;
    this.host = host;
  }

  setOptions(options: HorizontalPanesOptions): void {
    this.options = options;
    this.applyCssVariables();
  }

  setEnabled(nextEnabled: boolean): void {
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

  isEnabled(): boolean {
    return this.enabled;
  }

  focusMain(behavior: ScrollBehavior = 'smooth', restoreEditor = true): void {
    const mainContainer = this.getMainContainer();
    let outgoingCommit: Promise<void> | null = null;
    if (restoreEditor) {
      this.rememberCurrentEditor();
      if (mainContainer) {
        outgoingCommit = this.releaseEditorOutside(mainContainer);
      }
    }

    const appContainer = this.getAppContainer();
    if (appContainer) {
      const nextLeft = mainContainer
        ? this.getCenteredScrollLeft(appContainer, mainContainer)
        : 0;
      appContainer.scrollTo({ left: nextLeft, behavior });
    }
    this.clearActivePane();

    if (restoreEditor && mainContainer && this.enabled) {
      this.scheduleEditorRestore(mainContainer, outgoingCommit);
    }
  }

  focusAdjacentPane(direction: -1 | 1): void {
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

  moveActivePane(direction: -1 | 1): boolean {
    this.rememberCurrentEditor();
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

  navigateActivePaneHistory(direction: 'back' | 'forward'): boolean {
    if (!this.enabled) return false;

    const activePane = this.getPanes().find((pane) =>
      pane.classList.contains(ACTIVE_PANE_CLASS)
    );
    if (!activePane) return false;

    this.queuePaneHistoryNavigation(activePane, direction);
    return true;
  }

  destroy(): void {
    this.enabled = false;
    this.deactivate();
  }

  private activate(): void {
    const body = this.getDocument().body;
    body.classList.add(BODY_CLASS);
    body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
    this.applyCssVariables();
    this.installHistoryRouting();

    this.getDocument().addEventListener('wheel', this.handleWheel, {
      capture: true,
      passive: false,
    });
    this.getDocument().addEventListener('pointerdown', this.handlePointerDown, true);
    this.getDocument().addEventListener('pointermove', this.handlePointerMove, {
      capture: true,
      passive: false,
    });
    this.getDocument().addEventListener('pointerup', this.handlePointerUp, true);
    this.getDocument().addEventListener('pointercancel', this.handlePointerCancel, true);
    this.getDocument().addEventListener('click', this.handleClick, true);
    this.getDocument().addEventListener('dblclick', this.handleDoubleClick, true);
    this.getDocument().addEventListener('focusin', this.handleFocusIn, true);
    this.getDocument().addEventListener('focusout', this.handleFocusOut, true);
    this.getWindow().addEventListener('blur', this.handleWindowBlur);

    this.ensureSidebarList(false);
    this.sidebarPoll = window.setInterval(() => this.ensureSidebarList(true), 400);
  }

  private deactivate(): void {
    const document = this.getDocument();
    this.restoreHistoryRouting();
    this.finishPaneResize();
    this.setResizeTarget(null);
    document.body.classList.remove(
      BODY_CLASS,
      SNAP_CLASS,
      RESIZE_TARGET_BODY_CLASS,
      RESIZING_BODY_CLASS
    );
    document.body.style.removeProperty('--horizontal-panes-main-width');
    document.body.style.removeProperty('--horizontal-panes-pane-width');
    document.body.style.removeProperty('--horizontal-panes-last-pane-max-width');
    document.body.style.removeProperty('--horizontal-panes-gap');
    document.body.style.removeProperty('--horizontal-panes-main-gap');
    document.removeEventListener('wheel', this.handleWheel, true);
    document.removeEventListener('pointerdown', this.handlePointerDown, true);
    document.removeEventListener('pointermove', this.handlePointerMove, true);
    document.removeEventListener('pointerup', this.handlePointerUp, true);
    document.removeEventListener('pointercancel', this.handlePointerCancel, true);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('dblclick', this.handleDoubleClick, true);
    document.removeEventListener('focusin', this.handleFocusIn, true);
    document.removeEventListener('focusout', this.handleFocusOut, true);
    this.getWindow().removeEventListener('blur', this.handleWindowBlur);

    if (this.sidebarPoll !== null) {
      window.clearInterval(this.sidebarPoll);
      this.sidebarPoll = null;
    }

    if (this.pendingFocusFrame !== null) {
      window.cancelAnimationFrame(this.pendingFocusFrame);
      this.pendingFocusFrame = null;
    }

    if (this.pendingEditorFrame !== null) {
      window.cancelAnimationFrame(this.pendingEditorFrame);
      this.pendingEditorFrame = null;
    }
    this.editorRestoreGeneration += 1;
    this.pendingOutgoingCommit = null;
    this.pendingReferencePointer = null;
    this.pendingBlockPointer = null;
    this.clearSuppressedReferenceClick();
    this.clearSuppressedBlockClick();
    this.finishPendingPaneInsertion();

    this.disconnectSidebarList();
    this.focusMain('auto', false);
  }

  private installHistoryRouting(): void {
    if (this.historyRouting) return;

    const history = this.getWindow().history;
    const originalBack = history.back;
    const originalForward = history.forward;
    const backDescriptor = Object.getOwnPropertyDescriptor(history, 'back');
    const forwardDescriptor = Object.getOwnPropertyDescriptor(history, 'forward');
    const backWrapper: History['back'] = () => {
      if (!this.navigateActivePaneHistory('back')) {
        originalBack.call(history);
      }
    };
    const forwardWrapper: History['forward'] = () => {
      if (!this.navigateActivePaneHistory('forward')) {
        originalForward.call(history);
      }
    };

    try {
      Object.defineProperties(history, {
        back: {
          configurable: true,
          writable: true,
          value: backWrapper,
        },
        forward: {
          configurable: true,
          writable: true,
          value: forwardWrapper,
        },
      });
      this.historyRouting = {
        history,
        backDescriptor,
        forwardDescriptor,
        backWrapper,
        forwardWrapper,
      };
    } catch {
      this.restoreHistoryProperty(history, 'back', backDescriptor);
      this.restoreHistoryProperty(history, 'forward', forwardDescriptor);
    }
  }

  private restoreHistoryRouting(): void {
    const routing = this.historyRouting;
    if (!routing) return;
    this.historyRouting = null;

    if (routing.history.back === routing.backWrapper) {
      this.restoreHistoryProperty(
        routing.history,
        'back',
        routing.backDescriptor
      );
    }
    if (routing.history.forward === routing.forwardWrapper) {
      this.restoreHistoryProperty(
        routing.history,
        'forward',
        routing.forwardDescriptor
      );
    }
  }

  private restoreHistoryProperty(
    history: History,
    key: 'back' | 'forward',
    descriptor: PropertyDescriptor | undefined
  ): void {
    if (descriptor) {
      Object.defineProperty(history, key, descriptor);
    } else {
      Reflect.deleteProperty(history, key);
    }
  }

  private applyCssVariables(): void {
    if (!this.enabled) return;
    const body = this.getDocument().body;
    body.style.setProperty('--horizontal-panes-main-width', `${this.options.mainWidthPx}px`);
    body.style.setProperty('--horizontal-panes-pane-width', `${this.options.paneWidthPx}px`);
    body.style.setProperty(
      '--horizontal-panes-last-pane-max-width',
      `${Math.round(this.options.paneWidthPx * 1.25)}px`
    );
    body.style.setProperty('--horizontal-panes-gap', `${this.options.paneGapPx}px`);
    body.style.setProperty('--horizontal-panes-main-gap', `${this.options.mainPaneGapPx}px`);
    body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
  }

  private ensureSidebarList(focusNewestWhenAttached: boolean): void {
    const nextList = this.getDocument().querySelector<HTMLElement>(SIDEBAR_LIST_SELECTOR);
    if (nextList === this.sidebarList && nextList?.isConnected) {
      this.getPanes().forEach((pane) => this.attachPaneScrollListener(pane));
      return;
    }

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

  private disconnectSidebarList(): void {
    this.finishPaneResize();
    this.setResizeTarget(null);
    this.sidebarObserver?.disconnect();
    this.sidebarObserver = null;
    this.paneScrollListeners.forEach((pane) => {
      pane.removeEventListener('scroll', this.handlePaneScroll);
      pane.classList.remove(
        ACTIVE_PANE_CLASS,
        LAST_PANE_CLASS,
        MANUAL_WIDTH_CLASS,
        RESIZE_TARGET_CLASS
      );
      pane.style.removeProperty('order');
      pane.style.removeProperty('--horizontal-panes-pane-width-override');
      pane.querySelector(`.${HISTORY_CONTROLS_CLASS}`)?.remove();
    });
    this.paneScrollListeners.clear();
    this.paneOrder = [];
    this.sidebarList = null;
  }

  private readonly handleSidebarMutations = (mutations: MutationRecord[]): void => {
    const addedPanes = new Set<HTMLElement>();
    const removedPanes = new Set<HTMLElement>();

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof this.getWindow().Element)) continue;
        const element = node as Element;
        if (element.matches('.sidebar-item')) {
          addedPanes.add(element as HTMLElement);
        }
        element
          .querySelectorAll<HTMLElement>('.sidebar-item')
          .forEach((pane) => addedPanes.add(pane));
      }
      for (const node of mutation.removedNodes) {
        if (!(node instanceof this.getWindow().Element)) continue;
        const element = node as Element;
        if (element.matches('.sidebar-item')) {
          removedPanes.add(element as HTMLElement);
        }
        element
          .querySelectorAll<HTMLElement>('.sidebar-item')
          .forEach((pane) => removedPanes.add(pane));
      }
    }

    const nativePanes = this.getNativePanes();
    const currentPanes = new Set(nativePanes);
    const pendingInsertion = this.pendingPaneInsertion;
    const insertedPanes = new Set(
      [...addedPanes].filter(
        (pane) =>
          !removedPanes.has(pane) &&
          !pendingInsertion?.existingPanes.has(pane)
      )
    );
    if (this.paneResize && !currentPanes.has(this.paneResize.pane)) {
      this.finishPaneResize();
    }
    if (this.resizeTargetPane && !currentPanes.has(this.resizeTargetPane)) {
      this.setResizeTarget(null);
    }
    this.paneScrollListeners.forEach((pane) => {
      if (currentPanes.has(pane)) return;
      pane.removeEventListener('scroll', this.handlePaneScroll);
      pane.classList.remove(
        ACTIVE_PANE_CLASS,
        LAST_PANE_CLASS,
        MANUAL_WIDTH_CLASS,
        RESIZE_TARGET_CLASS
      );
      pane.style.removeProperty('order');
      pane.style.removeProperty('--horizontal-panes-pane-width-override');
      this.paneScrollListeners.delete(pane);
    });
    const retainedOrder = this.paneOrder.filter(
      (pane) => currentPanes.has(pane) && !insertedPanes.has(pane)
    );
    const appendedOrder = nativePanes
      .filter((pane) => insertedPanes.has(pane) || !retainedOrder.includes(pane))
      .reverse();
    const newestPane = nativePanes.find((pane) => insertedPanes.has(pane));
    const sourceIndex = pendingInsertion
      ? retainedOrder.indexOf(pendingInsertion.sourcePane)
      : -1;
    const replacementSourceRemoved = Boolean(
      pendingInsertion?.action === 'replace' &&
        pendingInsertion.replacementPane &&
        !currentPanes.has(pendingInsertion.sourcePane)
    );

    if (newestPane && sourceIndex >= 0 && pendingInsertion) {
      const insertionIndex =
        pendingInsertion.action === 'replace' ? sourceIndex : sourceIndex + 1;
      this.paneOrder = [
        ...retainedOrder.slice(0, insertionIndex),
        newestPane,
        ...retainedOrder.slice(insertionIndex),
        ...appendedOrder.filter((pane) => pane !== newestPane),
      ];
    } else {
      this.paneOrder = [...retainedOrder, ...appendedOrder];
    }
    if (
      newestPane &&
      pendingInsertion?.action === 'replace' &&
      pendingInsertion.replacementHistory
    ) {
      this.paneHistories.set(newestPane, pendingInsertion.replacementHistory);
      this.restorePaneHistoryEntry(newestPane, pendingInsertion.replacementHistory);
    }
    if (newestPane && pendingInsertion?.action === 'replace') {
      this.transferPaneWidth(pendingInsertion.sourcePane, newestPane);
    }
    this.applyPaneOrder();
    this.paneOrder.forEach((pane) => this.attachPaneScrollListener(pane));

    if (newestPane) {
      if (pendingInsertion?.action === 'replace') {
        if (sourceIndex >= 0) {
          pendingInsertion.replacementPane = newestPane;
          if (!this.closeNativePane(pendingInsertion.sourcePane)) {
            console.warn('Horizontal Panes could not find the native pane close control');
          }
        } else {
          this.finishPendingPaneInsertion(pendingInsertion);
        }
      } else if (pendingInsertion) {
        this.finishPendingPaneInsertion(pendingInsertion);
      }
      this.scheduleFocus(newestPane);
    }

    if (replacementSourceRemoved && pendingInsertion) {
      this.finishPendingPaneInsertion(pendingInsertion);
    }
  };

  private scheduleFocus(pane: HTMLElement): void {
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

  private focusPane(pane: HTMLElement): void {
    this.rememberCurrentEditor();
    const outgoingCommit = this.releaseEditorOutside(pane);
    const appContainer = this.getAppContainer();
    if (!appContainer) return;

    const history = this.paneHistories.get(pane);
    const historyEntry = history?.entries[history.index];
    if (historyEntry?.scrollTop !== undefined) {
      pane.scrollTop = historyEntry.scrollTop;
    }
    this.markActivePane(pane);
    const nextLeft = this.getCenteredScrollLeft(appContainer, pane);
    appContainer.scrollTo({ left: nextLeft, behavior: 'smooth' });
    this.scheduleEditorRestore(pane, outgoingCommit);
  }

  private getCenteredScrollLeft(
    appContainer: HTMLElement,
    target: HTMLElement
  ): number {
    return scrollLeftForElement(
      appContainer.getBoundingClientRect(),
      target.getBoundingClientRect(),
      appContainer.scrollLeft,
      Math.max(0, appContainer.scrollWidth - appContainer.clientWidth)
    );
  }

  private markActivePane(pane: HTMLElement): void {
    this.clearActivePane();
    pane.classList.add(ACTIVE_PANE_CLASS);
  }

  private clearActivePane(): void {
    this.sidebarList
      ?.querySelectorAll(`.${ACTIVE_PANE_CLASS}`)
      .forEach((pane) => pane.classList.remove(ACTIVE_PANE_CLASS));
  }

  private attachPaneScrollListener(pane: HTMLElement): void {
    if (!this.paneScrollListeners.has(pane)) {
      pane.addEventListener('scroll', this.handlePaneScroll, { passive: true });
      this.paneScrollListeners.add(pane);
    }
    this.ensurePaneHistoryControls(pane);
  }

  private readonly handlePaneScroll = (event: Event): void => {
    const pane = event.currentTarget;
    if (pane instanceof this.getWindow().HTMLElement) {
      const history = this.paneHistories.get(pane);
      const entry = history?.entries[history.index];
      if (entry) entry.scrollTop = pane.scrollTop;
    }
    // Logseq DB graphs virtualize sidebar content against this native list.
    this.sidebarList?.dispatchEvent(new Event('scroll'));
  };

  private ensurePaneHistoryControls(pane: HTMLElement): void {
    const header = pane.querySelector<HTMLElement>('.sidebar-item-header');
    if (!header) return;

    const history = this.ensurePaneHistory(pane);
    if (header.querySelector(`.${HISTORY_CONTROLS_CLASS}`)) {
      this.updatePaneHistoryControls(pane, history);
      return;
    }

    const controls = this.getDocument().createElement('span');
    controls.className = HISTORY_CONTROLS_CLASS;
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Pane history');

    controls.append(
      this.createPaneHistoryButton('back', 'Back in pane'),
      this.createPaneHistoryButton('forward', 'Forward in pane')
    );

    const nativeActions = header.querySelector<HTMLElement>(':scope > .item-actions');
    header.insertBefore(controls, nativeActions);
    this.updatePaneHistoryControls(pane, history);
  }

  private createPaneHistoryButton(
    direction: 'back' | 'forward',
    label: string
  ): HTMLButtonElement {
    const button = this.getDocument().createElement('button');
    button.type = 'button';
    button.disabled = true;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('data-horizontal-panes-history', direction);
    button.innerHTML =
      direction === 'back'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/><path d="M9 12h10"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/><path d="M5 12h10"/></svg>';
    return button;
  }

  private ensurePaneHistory(pane: HTMLElement): PaneHistorySession {
    const existing = this.paneHistories.get(pane);
    if (existing) return existing;

    const initialEntry = this.getPaneHistoryEntry(pane);
    const history: PaneHistorySession = initialEntry
      ? { entries: [initialEntry], index: 0 }
      : { entries: [], index: -1 };
    this.paneHistories.set(pane, history);
    return history;
  }

  private getPaneHistoryEntry(pane: HTMLElement): PaneHistoryEntry | null {
    if (pane.classList.contains('item-type-page')) {
      const pageId = this.getPanePageId(pane);
      if (pageId) return { target: pageId };

      const header = pane.querySelector<HTMLElement>('.sidebar-item-header');
      const pageTitle =
        header?.querySelector<HTMLElement>('button[aria-controls]')?.textContent?.trim() ??
        '';
      return pageTitle ? { target: pageTitle, reference: pageTitle } : null;
    }

    const rootBlock = pane.querySelector<HTMLElement>(BLOCK_SELECTOR);
    const blockId = rootBlock ? this.getBlockId(rootBlock)?.trim() : null;
    return blockId ? { target: blockId } : null;
  }

  private updatePaneHistoryControls(
    pane: HTMLElement,
    history: PaneHistorySession = this.ensurePaneHistory(pane)
  ): void {
    const back = pane.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="back"]'
    );
    const forward = pane.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="forward"]'
    );
    if (back) back.disabled = history.index <= 0;
    if (forward) {
      forward.disabled =
        history.index < 0 || history.index >= history.entries.length - 1;
    }
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    if (
      !this.enabled ||
      !shouldRemapWheelToHorizontal({
        shiftKey: event.shiftKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      })
    ) {
      return;
    }

    const appContainer = this.getAppContainer();
    if (!appContainer) return;

    event.preventDefault();
    appContainer.scrollLeft += event.deltaY;
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pendingReferencePointer = null;
    this.pendingBlockPointer = null;
    if (!this.enabled || event.button !== 0) return;

    const resizePane = this.findPaneResizeTarget(event.clientX, event.clientY);
    if (resizePane) {
      this.beginPaneResize(resizePane, event);
      return;
    }

    const target = event.target;
    if (!(target instanceof this.getWindow().Element)) return;
    const targetElement = target as Element;
    const referenceActivation = this.getPaneReferenceActivation(targetElement);
    const blockActivation = this.getPaneBlockActivation(targetElement);
    const referenceAction = this.isUnmodifiedPrimaryEvent(event)
      ? 'replace'
      : this.isShiftPrimaryEvent(event)
        ? 'insert'
        : null;
    if (this.options.openPaneLinks && referenceAction && referenceActivation) {
      this.pendingReferencePointer = {
        ...referenceActivation,
        action: referenceAction,
        pointerId: event.pointerId,
      };
      // Own both navigation variants. Some Logseq versions act during pointer-down,
      // which would race the plugin's visual insertion transaction.
      event.stopImmediatePropagation();
    }

    if (this.options.openPaneLinks && referenceAction && blockActivation) {
      this.pendingBlockPointer = {
        ...blockActivation,
        action: referenceAction,
        pointerId: event.pointerId,
      };
      event.stopImmediatePropagation();
    }

    const pane = targetElement.closest<HTMLElement>('.sidebar-item');
    if (pane && this.sidebarList?.contains(pane)) {
      this.rememberCurrentEditor();
      this.markActivePane(pane);
      return;
    }

    if (targetElement.closest(MAIN_CONTAINER_SELECTOR)) {
      this.rememberCurrentEditor();
      this.clearActivePane();
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;

    if (!this.paneResize) {
      this.setResizeTarget(this.findPaneResizeTarget(event.clientX, event.clientY));
      return;
    }
    if (event.pointerId !== this.paneResize.pointerId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const nextWidth = Math.min(
      MAX_PANE_WIDTH_PX,
      Math.max(
        MIN_PANE_WIDTH_PX,
        Math.round(
          this.paneResize.startWidth +
            event.clientX -
            this.paneResize.startClientX
        )
      )
    );
    this.paneResize.pane.style.setProperty(
      '--horizontal-panes-pane-width-override',
      `${nextWidth}px`
    );
    this.paneResize.pane.classList.add(MANUAL_WIDTH_CLASS);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.paneResize && event.pointerId === this.paneResize.pointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.finishPaneResize();
      this.setResizeTarget(this.findPaneResizeTarget(event.clientX, event.clientY));
      return;
    }

    const referencePointer = this.pendingReferencePointer;
    this.pendingReferencePointer = null;
    if (referencePointer) {
      if (
        !this.options.openPaneLinks ||
        referencePointer.pointerId !== event.pointerId ||
        (referencePointer.action === 'replace'
          ? !this.isUnmodifiedPrimaryEvent(event)
          : !this.isShiftPrimaryEvent(event))
      ) {
        return;
      }

      const activation = this.getPaneReferenceActivation(event.target);
      if (
        !activation ||
        activation.pane !== referencePointer.pane ||
        activation.reference !== referencePointer.reference
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.suppressNextReferenceClick(activation);
      this.referenceOpenQueue = this.referenceOpenQueue
        .catch(() => undefined)
        .then(() =>
          this.navigatePaneReference(
            activation.reference,
            activation.pane,
            referencePointer.action
          )
        );
      return;
    }

    const blockPointer = this.pendingBlockPointer;
    this.pendingBlockPointer = null;
    if (
      !this.options.openPaneLinks ||
      !blockPointer ||
      blockPointer.pointerId !== event.pointerId ||
      (blockPointer.action === 'replace'
        ? !this.isUnmodifiedPrimaryEvent(event)
        : !this.isShiftPrimaryEvent(event))
    ) {
      return;
    }

    const blockActivation = this.getPaneBlockActivation(event.target);
    if (
      !blockActivation ||
      blockActivation.pane !== blockPointer.pane ||
      blockActivation.blockId !== blockPointer.blockId
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressNextBlockClick(blockActivation);
    this.referenceOpenQueue = this.referenceOpenQueue
      .catch(() => undefined)
      .then(() =>
        this.navigatePaneTarget(
          blockActivation.blockId,
          blockActivation.pane,
          blockPointer.action
        )
      );
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pendingReferencePointer?.pointerId === event.pointerId) {
      this.pendingReferencePointer = null;
    }
    if (this.pendingBlockPointer?.pointerId === event.pointerId) {
      this.pendingBlockPointer = null;
    }
    if (!this.paneResize || event.pointerId !== this.paneResize.pointerId) return;
    this.finishPaneResize();
    this.setResizeTarget(null);
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.handlePaneHistoryClick(event)) return;

    const suppressed = this.suppressedReferenceClick;
    if (suppressed) {
      const referenceActivation = this.getPaneReferenceActivation(event.target);
      if (
        referenceActivation &&
        referenceActivation.pane === suppressed.pane &&
        referenceActivation.reference === suppressed.reference
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.clearSuppressedReferenceClick();
        return;
      }
    }

    const suppressedBlock = this.suppressedBlockClick;
    if (!suppressedBlock) return;

    const blockActivation = this.getPaneBlockActivation(event.target);
    if (
      blockActivation &&
      blockActivation.pane === suppressedBlock.pane &&
      blockActivation.blockId === suppressedBlock.blockId
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.clearSuppressedBlockClick();
    }
  };

  private handlePaneHistoryClick(event: MouseEvent): boolean {
    if (!this.enabled || !(event.target instanceof this.getWindow().Element)) {
      return false;
    }

    const button = (event.target as Element).closest<HTMLButtonElement>(
      'button[data-horizontal-panes-history]'
    );
    if (!button || button.disabled) return false;

    const pane = button.closest<HTMLElement>('.sidebar-item');
    const direction = button.getAttribute('data-horizontal-panes-history');
    if (
      !pane ||
      pane.parentElement !== this.sidebarList ||
      (direction !== 'back' && direction !== 'forward')
    ) {
      return false;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.queuePaneHistoryNavigation(pane, direction);
    return true;
  }

  private queuePaneHistoryNavigation(
    pane: HTMLElement,
    direction: 'back' | 'forward'
  ): void {
    this.referenceOpenQueue = this.referenceOpenQueue
      .catch(() => undefined)
      .then(() => this.navigatePaneHistory(pane, direction));
  }

  private getPaneReferenceActivation(target: EventTarget | null): PaneReferenceActivation | null {
    if (!(target instanceof this.getWindow().Element)) return null;

    const referenceElement = (target as Element).closest<HTMLElement>(
      'a.page-ref, a.tag, a.block-ref, .block-ref[data-ref]'
    );
    if (!referenceElement) return null;

    const pane = referenceElement.closest<HTMLElement>('.sidebar-item');
    if (!pane || pane.parentElement !== this.sidebarList) return null;

    const wrapper = referenceElement.closest<HTMLElement>(
      '.page-reference[data-ref], .block-ref[data-ref]'
    );
    const reference =
      (wrapper && pane.contains(wrapper) ? wrapper.getAttribute('data-ref') : null) ??
      referenceElement.getAttribute('data-ref');
    const normalizedReference = reference?.trim();
    if (!normalizedReference) return null;

    return { pane, reference: normalizedReference };
  }

  private getPaneBlockActivation(target: EventTarget | null): PaneBlockActivation | null {
    if (!(target instanceof this.getWindow().Element)) return null;

    const bullet = (target as Element).closest<HTMLElement>(
      '.bullet-container, .bullet'
    );
    if (!bullet) return null;

    const block = bullet.closest<HTMLElement>(BLOCK_SELECTOR);
    const pane = (block ?? bullet).closest<HTMLElement>('.sidebar-item');
    const blockId = (this.getBlockId(bullet) ?? (block ? this.getBlockId(block) : null))?.trim();
    if (!pane || pane.parentElement !== this.sidebarList || !blockId) return null;

    return { pane, blockId };
  }

  private isUnmodifiedPrimaryEvent(event: MouseEvent): boolean {
    return (
      event.button === 0 &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    );
  }

  private isShiftPrimaryEvent(event: MouseEvent): boolean {
    return (
      event.button === 0 &&
      event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    );
  }

  private suppressNextReferenceClick(activation: PaneReferenceActivation): void {
    this.clearSuppressedReferenceClick();
    this.suppressedReferenceClick = activation;
    this.suppressedReferenceClickTimer = window.setTimeout(() => {
      this.suppressedReferenceClick = null;
      this.suppressedReferenceClickTimer = null;
    }, 0);
  }

  private clearSuppressedReferenceClick(): void {
    if (this.suppressedReferenceClickTimer !== null) {
      window.clearTimeout(this.suppressedReferenceClickTimer);
      this.suppressedReferenceClickTimer = null;
    }
    this.suppressedReferenceClick = null;
  }

  private suppressNextBlockClick(activation: PaneBlockActivation): void {
    this.clearSuppressedBlockClick();
    this.suppressedBlockClick = activation;
    this.suppressedBlockClickTimer = window.setTimeout(() => {
      this.suppressedBlockClick = null;
      this.suppressedBlockClickTimer = null;
    }, 0);
  }

  private clearSuppressedBlockClick(): void {
    if (this.suppressedBlockClickTimer !== null) {
      window.clearTimeout(this.suppressedBlockClickTimer);
      this.suppressedBlockClickTimer = null;
    }
    this.suppressedBlockClick = null;
  }

  private async navigatePaneHistory(
    sourcePane: HTMLElement,
    direction: 'back' | 'forward'
  ): Promise<void> {
    const openReference = this.host.openPaneReference;
    if (
      !this.enabled ||
      !openReference ||
      !sourcePane.isConnected ||
      !this.getPanes().includes(sourcePane)
    ) {
      return;
    }

    const history = this.ensurePaneHistory(sourcePane);
    this.rememberPaneHistoryEntry(sourcePane, history);
    const nextIndex = history.index + (direction === 'back' ? -1 : 1);
    const entry = history.entries[nextIndex];
    if (!entry) return;

    let target = entry.target;
    if (entry.reference && this.host.resolvePaneReference) {
      try {
        target =
          (await this.host.resolvePaneReference(entry.reference)) ?? entry.target;
      } catch {
        return;
      }
    }
    if (!sourcePane.isConnected || !this.getPanes().includes(sourcePane)) return;

    const existingPane = this.findPaneForTarget(target, entry.reference);
    if (existingPane) {
      this.scheduleFocus(existingPane);
      return;
    }

    const replacementHistory: PaneHistorySession = {
      entries: [...history.entries],
      index: nextIndex,
    };
    const { pendingInsertion, insertionComplete } = this.beginPendingPaneInsertion(
      sourcePane,
      'replace',
      false,
      replacementHistory
    );

    try {
      await openReference(target);
    } catch {
      this.finishPendingPaneInsertion(pendingInsertion);
      return;
    }

    if (this.pendingPaneInsertion === pendingInsertion) {
      pendingInsertion.timeout = window.setTimeout(
        () => this.finishPendingPaneInsertion(pendingInsertion),
        1500
      );
    }
    await insertionComplete;
  }

  private async navigatePaneReference(
    reference: string,
    sourcePane: HTMLElement,
    action: PaneReferenceAction
  ): Promise<void> {
    const resolveReference = this.host.resolvePaneReference;
    const openReference = this.host.openPaneReference;
    if (!this.enabled || !resolveReference || !openReference) return;

    let target: PaneReferenceTarget | null;
    try {
      target = await resolveReference(reference);
    } catch {
      return;
    }
    if (target === null) return;
    await this.navigatePaneTarget(target, sourcePane, action, reference);
  }

  private async navigatePaneTarget(
    target: PaneReferenceTarget,
    sourcePane: HTMLElement,
    action: PaneReferenceAction,
    reference?: string
  ): Promise<void> {
    const openReference = this.host.openPaneReference;
    if (
      !this.enabled ||
      !openReference ||
      !sourcePane.isConnected ||
      !this.getPanes().includes(sourcePane)
    ) {
      return;
    }

    const existingPane = this.findPaneForTarget(target, reference);
    if (existingPane) {
      this.scheduleFocus(existingPane);
      return;
    }

    const replacementHistory =
      action === 'replace'
        ? this.getReplacementHistory(sourcePane, { target, reference })
        : null;
    const { pendingInsertion, insertionComplete } = this.beginPendingPaneInsertion(
      sourcePane,
      action,
      false,
      replacementHistory
    );

    try {
      await openReference(target);
    } catch {
      this.finishPendingPaneInsertion(pendingInsertion);
      return;
    }

    if (this.pendingPaneInsertion === pendingInsertion) {
      pendingInsertion.timeout = window.setTimeout(
        () => this.finishPendingPaneInsertion(pendingInsertion),
        1500
      );
    }
    await insertionComplete;
  }

  private getReplacementHistory(
    sourcePane: HTMLElement,
    nextEntry: PaneHistoryEntry
  ): PaneHistorySession {
    const history = this.ensurePaneHistory(sourcePane);
    this.rememberPaneHistoryEntry(sourcePane, history);
    const retainedEntries =
      history.index >= 0 ? history.entries.slice(0, history.index + 1) : [];
    return {
      entries: [...retainedEntries, nextEntry],
      index: retainedEntries.length,
    };
  }

  private rememberPaneHistoryEntry(
    pane: HTMLElement,
    history: PaneHistorySession = this.ensurePaneHistory(pane)
  ): void {
    this.rememberCurrentEditor();
    const entry = history.entries[history.index];
    if (!entry) return;

    entry.scrollTop = pane.scrollTop;
    const bookmark = this.editorBookmarks.get(pane);
    if (bookmark) {
      entry.editorBookmark = {
        blockId: bookmark.blockId,
        selectionStart: bookmark.selectionStart,
        selectionEnd: bookmark.selectionEnd,
      };
    }
  }

  private restorePaneHistoryEntry(
    pane: HTMLElement,
    history: PaneHistorySession
  ): void {
    const entry = history.entries[history.index];
    if (!entry) return;

    if (entry.scrollTop !== undefined) {
      pane.scrollTop = entry.scrollTop;
    }
    if (!entry.editorBookmark) {
      this.editorBookmarks.delete(pane);
      return;
    }

    const block =
      Array.from(pane.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).find(
        (candidate) => this.getBlockId(candidate) === entry.editorBookmark?.blockId
      ) ?? null;
    this.editorBookmarks.set(pane, {
      block,
      ...entry.editorBookmark,
    });
  }

  private transferPaneWidth(sourcePane: HTMLElement, targetPane: HTMLElement): void {
    if (!sourcePane.classList.contains(MANUAL_WIDTH_CLASS)) return;

    const width = sourcePane.style.getPropertyValue(
      '--horizontal-panes-pane-width-override'
    );
    if (!width) return;

    targetPane.style.setProperty('--horizontal-panes-pane-width-override', width);
    targetPane.classList.add(MANUAL_WIDTH_CLASS);
  }

  private findPaneForTarget(
    target: PaneReferenceTarget,
    reference?: string
  ): HTMLElement | null {
    const targetKey = this.normalizeTargetKey(target);
    const referenceKey = reference ? this.normalizeTargetKey(reference) : null;

    return (
      this.getPanes().find((pane) => {
        const pageId = this.getPanePageId(pane);
        if (pageId && this.normalizeTargetKey(pageId) === targetKey) {
          return true;
        }

        const rootBlock = pane.querySelector<HTMLElement>(BLOCK_SELECTOR);
        const rootBlockId = rootBlock ? this.getBlockId(rootBlock) : null;
        if (
          rootBlockId &&
          (this.normalizeTargetKey(rootBlockId) === targetKey ||
            (referenceKey !== null &&
              this.normalizeTargetKey(rootBlockId) === referenceKey))
        ) {
          return true;
        }

        if (!referenceKey || !pane.classList.contains('item-type-page')) {
          return false;
        }

        const header = pane.querySelector<HTMLElement>('.sidebar-item-header');
        const pageTitle =
          header?.querySelector<HTMLElement>('button[aria-controls]')?.textContent ??
          header?.textContent ??
          '';
        return this.normalizeTargetKey(pageTitle) === referenceKey;
      }) ?? null
    );
  }

  private getPanePageId(pane: HTMLElement): string | null {
    if (!pane.classList.contains('item-type-page')) return null;

    return (
      pane
        .querySelector<HTMLElement>('.page-blocks-inner > div > [id]')
        ?.id.trim() || null
    );
  }

  private normalizeTargetKey(target: PaneReferenceTarget): string {
    return String(target).trim().toLocaleLowerCase();
  }

  private beginPendingPaneInsertion(
    sourcePane: HTMLElement,
    action: PaneReferenceAction,
    startTimeout: boolean,
    replacementHistory: PaneHistorySession | null = null
  ): {
    pendingInsertion: PendingPaneInsertion;
    insertionComplete: Promise<void>;
  } {
    let resolveInsertion = (): void => undefined;
    const insertionComplete = new Promise<void>((resolve) => {
      resolveInsertion = resolve;
    });
    const pendingInsertion: PendingPaneInsertion = {
      action,
      sourcePane,
      existingPanes: new Set(this.getNativePanes()),
      replacementPane: null,
      replacementHistory,
      timeout: null,
      resolve: resolveInsertion,
    };
    this.finishPendingPaneInsertion();
    this.pendingPaneInsertion = pendingInsertion;
    if (startTimeout) {
      pendingInsertion.timeout = window.setTimeout(
        () => this.finishPendingPaneInsertion(pendingInsertion),
        1500
      );
    }
    return { pendingInsertion, insertionComplete };
  }

  private closeNativePane(pane: HTMLElement): boolean {
    const closeIcon = pane.querySelector<HTMLElement>(
      '.sidebar-item-header .item-actions .icon-tabler-x, ' +
        '.sidebar-item-header .item-actions .ti-x, ' +
        '.sidebar-item-header .item-actions [data-icon="x"]'
    );
    const closeControl =
      closeIcon?.closest<HTMLElement>('button, a') ??
      pane.querySelector<HTMLElement>('.sidebar-item-header .close') ??
      Array.from(
        pane.querySelectorAll<HTMLElement>('.sidebar-item-header .item-actions button')
      ).at(-1) ??
      null;
    if (!closeControl) return false;

    closeControl.click();
    return true;
  }

  private finishPendingPaneInsertion(
    pendingInsertion: PendingPaneInsertion | null = this.pendingPaneInsertion
  ): void {
    if (!pendingInsertion || this.pendingPaneInsertion !== pendingInsertion) return;
    if (pendingInsertion.timeout !== null) {
      window.clearTimeout(pendingInsertion.timeout);
    }
    this.pendingPaneInsertion = null;
    pendingInsertion.resolve();
  }

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.enabled) return;
    const pane = this.findPaneResizeTarget(event.clientX, event.clientY);
    if (!pane) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    pane.style.removeProperty('--horizontal-panes-pane-width-override');
    pane.classList.remove(MANUAL_WIDTH_CLASS);
  };

  private readonly handleWindowBlur = (): void => {
    this.pendingReferencePointer = null;
    this.pendingBlockPointer = null;
    this.clearSuppressedReferenceClick();
    this.clearSuppressedBlockClick();
    this.finishPaneResize();
    this.setResizeTarget(null);
  };

  private beginPaneResize(pane: HTMLElement, event: PointerEvent): void {
    event.preventDefault();
    event.stopImmediatePropagation();

    const captureTarget =
      event.target instanceof this.getWindow().Element
        ? (event.target as Element)
        : null;
    try {
      captureTarget?.setPointerCapture(event.pointerId);
    } catch {
      // Document-level listeners still keep the drag working if capture is unavailable.
    }

    this.paneResize = {
      pane,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: pane.getBoundingClientRect().width,
      captureTarget,
    };
    this.setResizeTarget(pane);
    this.getDocument().body.classList.add(RESIZING_BODY_CLASS);
  }

  private finishPaneResize(): void {
    const resize = this.paneResize;
    if (!resize) return;

    try {
      if (resize.captureTarget?.hasPointerCapture(resize.pointerId)) {
        resize.captureTarget.releasePointerCapture(resize.pointerId);
      }
    } catch {
      // Pointer capture can already be gone after a native cancellation.
    }

    this.paneResize = null;
    this.getDocument().body.classList.remove(RESIZING_BODY_CLASS);
  }

  private findPaneResizeTarget(clientX: number, clientY: number): HTMLElement | null {
    let nearestPane: HTMLElement | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const pane of this.getPanes()) {
      if (pane.classList.contains('collapsed')) continue;
      const rect = pane.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (clientY < rect.top || clientY > rect.bottom) continue;
      if (
        clientX < rect.right - RESIZE_TARGET_INSIDE_PX ||
        clientX > rect.right + RESIZE_TARGET_OUTSIDE_PX
      ) {
        continue;
      }

      const distance = Math.abs(clientX - rect.right);
      if (distance < nearestDistance) {
        nearestPane = pane;
        nearestDistance = distance;
      }
    }

    return nearestPane;
  }

  private setResizeTarget(pane: HTMLElement | null): void {
    if (pane === this.resizeTargetPane) return;
    this.resizeTargetPane?.classList.remove(RESIZE_TARGET_CLASS);
    this.resizeTargetPane = pane;
    pane?.classList.add(RESIZE_TARGET_CLASS);
    this.getDocument().body.classList.toggle(RESIZE_TARGET_BODY_CLASS, pane !== null);
  }

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof this.getWindow().Element)) return;

    const container = this.getEditorContainer(target as Element);
    if (!container) return;

    if (container.matches('.sidebar-item')) {
      this.markActivePane(container);
    } else {
      this.clearActivePane();
    }
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof this.getWindow().HTMLElement)) return;
    this.rememberEditor(target);
  };

  private rememberCurrentEditor(): void {
    const activeElement = this.getDocument().activeElement;
    if (!(activeElement instanceof this.getWindow().HTMLElement)) return;
    this.rememberEditor(activeElement);
  }

  private rememberEditor(editor: HTMLElement): void {
    if (!editor.matches(EDITOR_SELECTOR)) return;

    const block = editor.closest<HTMLElement>(BLOCK_SELECTOR);
    const container = this.getEditorContainer(editor);
    if (!block || !container) return;

    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    if (
      editor instanceof this.getWindow().HTMLTextAreaElement ||
      editor instanceof this.getWindow().HTMLInputElement
    ) {
      selectionStart = editor.selectionStart;
      selectionEnd = editor.selectionEnd;
    }

    this.editorBookmarks.set(container, {
      block,
      blockId: this.getBlockId(block),
      selectionStart,
      selectionEnd,
    });
  }

  private releaseEditorOutside(targetContainer: HTMLElement): Promise<void> | null {
    const activeElement = this.getDocument().activeElement;
    if (!(activeElement instanceof this.getWindow().HTMLElement)) {
      return this.pendingOutgoingCommit;
    }
    if (!activeElement.matches(EDITOR_SELECTOR)) {
      return this.pendingOutgoingCommit;
    }
    if (targetContainer.contains(activeElement)) return null;

    let outgoingCommit: Promise<void> | null = null;
    try {
      outgoingCommit = this.host.commitCurrentEditor?.() ?? null;
    } catch {
      // A host bridge failure should not prevent keyboard navigation.
    }

    activeElement.blur();
    if (!outgoingCommit) return this.pendingOutgoingCommit;

    const previousCommit = this.pendingOutgoingCommit;
    const combinedCommit = previousCommit
      ? Promise.all([previousCommit, outgoingCommit]).then(() => undefined)
      : outgoingCommit;
    const trackedCommit = combinedCommit.catch(() => undefined);
    this.pendingOutgoingCommit = trackedCommit;
    void trackedCommit.then(() => {
      if (this.pendingOutgoingCommit === trackedCommit) {
        this.pendingOutgoingCommit = null;
      }
    });
    return trackedCommit;
  }

  private scheduleEditorRestore(
    container: HTMLElement,
    outgoingCommit: Promise<void> | null = null
  ): void {
    if (this.pendingEditorFrame !== null) {
      window.cancelAnimationFrame(this.pendingEditorFrame);
      this.pendingEditorFrame = null;
    }

    const restoreGeneration = ++this.editorRestoreGeneration;
    const queueRestore = (): void => {
      if (restoreGeneration !== this.editorRestoreGeneration) return;
      this.pendingEditorFrame = window.requestAnimationFrame(() => {
        this.pendingEditorFrame = null;
        if (
          restoreGeneration !== this.editorRestoreGeneration ||
          !this.enabled ||
          !container.isConnected
        ) {
          return;
        }
        this.restoreEditor(container);
      });
    };

    if (outgoingCommit) {
      void outgoingCommit.catch(() => undefined).then(queueRestore);
    } else {
      queueRestore();
    }
  }

  private restoreEditor(container: HTMLElement): void {
    const bookmark = this.editorBookmarks.get(container);
    const block = this.resolveBookmarkedBlock(container, bookmark) ?? this.getFirstEditableBlock(container);
    const editor = this.findEditor(block ?? container);

    if (editor) {
      this.focusEditor(editor, bookmark);
      return;
    }

    if (!block) return;
    this.activateBlock(block);
    this.focusEditorAfterMount(container, block, bookmark, 4);
  }

  private focusEditorAfterMount(
    container: HTMLElement,
    block: HTMLElement,
    bookmark: EditorBookmark | undefined,
    attemptsRemaining: number
  ): void {
    if (attemptsRemaining === 0) return;

    this.pendingEditorFrame = window.requestAnimationFrame(() => {
      this.pendingEditorFrame = null;
      if (!this.enabled || !container.isConnected) return;

      const currentBlock = this.resolveBookmarkedBlock(container, bookmark) ?? block;
      const editor = this.findEditor(currentBlock);
      if (editor) {
        this.focusEditor(editor, bookmark);
      } else {
        this.focusEditorAfterMount(container, currentBlock, bookmark, attemptsRemaining - 1);
      }
    });
  }

  private focusEditor(editor: HTMLElement, bookmark: EditorBookmark | undefined): void {
    editor.focus({ preventScroll: true });

    if (
      editor instanceof this.getWindow().HTMLTextAreaElement ||
      editor instanceof this.getWindow().HTMLInputElement
    ) {
      const fallbackPosition = editor.value.length;
      const selectionStart = Math.min(bookmark?.selectionStart ?? fallbackPosition, fallbackPosition);
      const selectionEnd = Math.min(bookmark?.selectionEnd ?? selectionStart, fallbackPosition);
      editor.setSelectionRange(selectionStart, selectionEnd);
      return;
    }

    if (editor.isContentEditable) {
      const selection = this.getWindow().getSelection();
      const range = this.getDocument().createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  private activateBlock(block: HTMLElement): void {
    const target =
      BLOCK_ACTIVATOR_SELECTORS.map((selector) =>
        block.querySelector<HTMLElement>(selector)
      ).find((candidate) => candidate !== null) ?? block;
    const HostMouseEvent = this.getWindow().MouseEvent;
    const HostPointerEvent = this.getWindow().PointerEvent;
    const targetRect = target.getBoundingClientRect();
    const eventOptions: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: targetRect.left + Math.min(20, targetRect.width / 2),
      clientY: targetRect.top + targetRect.height / 2,
    };

    if (typeof HostPointerEvent === 'function') {
      target.dispatchEvent(
        new HostPointerEvent('pointerdown', {
          ...eventOptions,
          buttons: 1,
          isPrimary: true,
          pointerId: 1,
          pointerType: 'mouse',
        })
      );
      target.dispatchEvent(
        new HostPointerEvent('pointerup', {
          ...eventOptions,
          buttons: 0,
          isPrimary: true,
          pointerId: 1,
          pointerType: 'mouse',
        })
      );
    } else {
      target.dispatchEvent(new HostMouseEvent('pointerdown', eventOptions));
      target.dispatchEvent(new HostMouseEvent('pointerup', eventOptions));
    }

    target.dispatchEvent(new HostMouseEvent('mousedown', eventOptions));
    target.dispatchEvent(new HostMouseEvent('mouseup', eventOptions));
    target.click();
  }

  private resolveBookmarkedBlock(
    container: HTMLElement,
    bookmark: EditorBookmark | undefined
  ): HTMLElement | null {
    if (!bookmark) return null;
    if (
      bookmark.block?.isConnected &&
      container.contains(bookmark.block)
    ) {
      return bookmark.block;
    }
    if (!bookmark.blockId) return null;

    return (
      Array.from(container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).find(
        (block) => this.getBlockId(block) === bookmark.blockId
      ) ?? null
    );
  }

  private getFirstEditableBlock(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>(BLOCK_SELECTOR);
  }

  private findEditor(container: HTMLElement): HTMLElement | null {
    if (container.matches(EDITOR_SELECTOR)) return container;
    return container.querySelector<HTMLElement>(EDITOR_SELECTOR);
  }

  private getEditorContainer(element: Element): HTMLElement | null {
    const pane = element.closest<HTMLElement>('.sidebar-item');
    if (pane && this.sidebarList?.contains(pane)) return pane;

    const mainContainer = this.getMainContainer();
    if (mainContainer?.contains(element)) return mainContainer;

    return null;
  }

  private getBlockId(block: HTMLElement): string | null {
    return (
      block.getAttribute('blockid') ??
      block.getAttribute('data-uuid') ??
      block.getAttribute('data-blockid')
    );
  }

  private getPanes(): HTMLElement[] {
    if (!this.sidebarList) return [];
    const currentPanes = new Set(this.getNativePanes());
    this.paneOrder = this.paneOrder.filter((pane) => currentPanes.has(pane));

    return [...this.paneOrder];
  }

  private getNativePanes(): HTMLElement[] {
    if (!this.sidebarList) return [];
    return Array.from(this.sidebarList.querySelectorAll<HTMLElement>(PANE_SELECTOR));
  }

  private applyPaneOrder(): void {
    this.paneOrder.forEach((pane, index) => {
      pane.style.order = String(index);
      pane.classList.toggle(LAST_PANE_CLASS, index === this.paneOrder.length - 1);
    });
  }

  private getAppContainer(): HTMLElement | null {
    return this.getDocument().querySelector<HTMLElement>(APP_CONTAINER_SELECTOR);
  }

  private getMainContainer(): HTMLElement | null {
    return this.getDocument().querySelector<HTMLElement>(MAIN_CONTAINER_SELECTOR);
  }

  private getDocument(): Document {
    return parent.document;
  }

  private getWindow(): Window & typeof globalThis {
    return parent as Window & typeof globalThis;
  }
}
