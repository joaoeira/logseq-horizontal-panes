import { scrollLeftForElement, shouldRemapWheelToHorizontal } from './geometry';

const BODY_CLASS = 'horizontal-panes-active';
const SNAP_CLASS = 'horizontal-panes-snap';
const ACTIVE_PANE_CLASS = 'horizontal-panes-active-pane';
const SIDEBAR_LIST_SELECTOR = '.sidebar-item-list';
const PANE_SELECTOR = ':scope > .sidebar-item';
const APP_CONTAINER_SELECTOR = '#app-container';
const MAIN_CONTAINER_SELECTOR = '#left-container';
const BLOCK_SELECTOR = '.ls-block';
const EDITOR_SELECTOR = [
  '.block-editor textarea',
  'textarea.block-editor',
  '.editor-inner textarea',
  '.block-editor input',
  '.block-editor [contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
].join(', ');
const BLOCK_ACTIVATOR_SELECTOR = [
  '.block-content-inner',
  '.block-content',
  '.block-title-wrap',
].join(', ');

type EditorBookmark = {
  block: HTMLElement;
  blockId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
};

export type HorizontalPanesOptions = {
  mainWidthPx: number;
  paneWidthPx: number;
  paneGapPx: number;
  mainPaneGapPx: number;
  scrollSnap: boolean;
};

export class HorizontalPanesController {
  private enabled = false;
  private options: HorizontalPanesOptions;
  private sidebarList: HTMLElement | null = null;
  private sidebarObserver: MutationObserver | null = null;
  private sidebarPoll: number | null = null;
  private paneScrollListeners = new Set<HTMLElement>();
  private paneOrder: HTMLElement[] = [];
  private pendingFocusFrame: number | null = null;
  private pendingEditorFrame: number | null = null;
  private editorBookmarks = new WeakMap<HTMLElement, EditorBookmark>();

  constructor(options: HorizontalPanesOptions) {
    this.options = options;
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
    if (restoreEditor) {
      this.rememberCurrentEditor();
      if (mainContainer) {
        this.releaseEditorOutside(mainContainer);
      }
    }

    const appContainer = this.getAppContainer();
    appContainer?.scrollTo({ left: 0, behavior });
    this.clearActivePane();

    if (restoreEditor && mainContainer && this.enabled) {
      this.scheduleEditorRestore(mainContainer);
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

  destroy(): void {
    this.enabled = false;
    this.deactivate();
  }

  private activate(): void {
    const body = this.getDocument().body;
    body.classList.add(BODY_CLASS);
    body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
    this.applyCssVariables();

    this.getDocument().addEventListener('wheel', this.handleWheel, {
      capture: true,
      passive: false,
    });
    this.getDocument().addEventListener('pointerdown', this.handlePointerDown, true);
    this.getDocument().addEventListener('focusin', this.handleFocusIn, true);
    this.getDocument().addEventListener('keydown', this.handleKeyDown, true);

    this.ensureSidebarList(false);
    this.sidebarPoll = window.setInterval(() => this.ensureSidebarList(true), 400);
  }

  private deactivate(): void {
    const document = this.getDocument();
    document.body.classList.remove(BODY_CLASS, SNAP_CLASS);
    document.body.style.removeProperty('--horizontal-panes-main-width');
    document.body.style.removeProperty('--horizontal-panes-pane-width');
    document.body.style.removeProperty('--horizontal-panes-gap');
    document.body.style.removeProperty('--horizontal-panes-main-gap');
    document.removeEventListener('wheel', this.handleWheel, true);
    document.removeEventListener('pointerdown', this.handlePointerDown, true);
    document.removeEventListener('focusin', this.handleFocusIn, true);
    document.removeEventListener('keydown', this.handleKeyDown, true);

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

    this.disconnectSidebarList();
    this.focusMain('auto', false);
  }

  private applyCssVariables(): void {
    if (!this.enabled) return;
    const body = this.getDocument().body;
    body.style.setProperty('--horizontal-panes-main-width', `${this.options.mainWidthPx}px`);
    body.style.setProperty('--horizontal-panes-pane-width', `${this.options.paneWidthPx}px`);
    body.style.setProperty('--horizontal-panes-gap', `${this.options.paneGapPx}px`);
    body.style.setProperty('--horizontal-panes-main-gap', `${this.options.mainPaneGapPx}px`);
    body.classList.toggle(SNAP_CLASS, this.options.scrollSnap);
  }

  private ensureSidebarList(focusNewestWhenAttached: boolean): void {
    const nextList = this.getDocument().querySelector<HTMLElement>(SIDEBAR_LIST_SELECTOR);
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

  private disconnectSidebarList(): void {
    this.sidebarObserver?.disconnect();
    this.sidebarObserver = null;
    this.paneScrollListeners.forEach((pane) => {
      pane.removeEventListener('scroll', this.handlePaneScroll);
      pane.classList.remove(ACTIVE_PANE_CLASS);
      pane.style.removeProperty('order');
    });
    this.paneScrollListeners.clear();
    this.paneOrder = [];
    this.sidebarList = null;
  }

  private readonly handleSidebarMutations = (mutations: MutationRecord[]): void => {
    const addedPanes = new Set<HTMLElement>();

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
    }

    const nativePanes = this.getNativePanes();
    const currentPanes = new Set(nativePanes);
    this.paneScrollListeners.forEach((pane) => {
      if (currentPanes.has(pane)) return;
      pane.removeEventListener('scroll', this.handlePaneScroll);
      pane.classList.remove(ACTIVE_PANE_CLASS);
      pane.style.removeProperty('order');
      this.paneScrollListeners.delete(pane);
    });
    const retainedOrder = this.paneOrder.filter(
      (pane) => currentPanes.has(pane) && !addedPanes.has(pane)
    );
    const appendedOrder = nativePanes
      .filter((pane) => addedPanes.has(pane) || !retainedOrder.includes(pane))
      .reverse();

    this.paneOrder = [...retainedOrder, ...appendedOrder];
    this.applyPaneOrder();
    this.paneOrder.forEach((pane) => this.attachPaneScrollListener(pane));

    const newestPane = nativePanes.find((pane) => addedPanes.has(pane));
    if (newestPane) {
      this.scheduleFocus(newestPane);
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
    this.releaseEditorOutside(pane);
    const appContainer = this.getAppContainer();
    if (!appContainer) return;

    this.markActivePane(pane);
    const nextLeft = scrollLeftForElement(
      appContainer.getBoundingClientRect(),
      pane.getBoundingClientRect(),
      appContainer.scrollLeft,
      this.options.paneGapPx
    );
    appContainer.scrollTo({ left: nextLeft, behavior: 'smooth' });
    this.scheduleEditorRestore(pane);
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
    if (this.paneScrollListeners.has(pane)) return;
    pane.addEventListener('scroll', this.handlePaneScroll, { passive: true });
    this.paneScrollListeners.add(pane);
  }

  private readonly handlePaneScroll = (): void => {
    // Logseq DB graphs virtualize sidebar content against this native list.
    this.sidebarList?.dispatchEvent(new Event('scroll'));
  };

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
    const target = event.target;
    if (!(target instanceof this.getWindow().Element)) return;
    const targetElement = target as Element;

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

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const isApplePlatform = /Mac|iPhone|iPad/.test(this.getWindow().navigator.platform);
    const modifierPressed = event.metaKey || (!isApplePlatform && event.ctrlKey);
    if (!this.enabled || event.altKey || !modifierPressed) return;

    const direction =
      event.code === 'BracketLeft'
        ? -1
        : event.code === 'BracketRight'
          ? 1
          : null;
    if (direction === null) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.shiftKey) {
      this.moveActivePane(direction);
    } else {
      this.focusAdjacentPane(direction);
    }
  };

  private rememberCurrentEditor(): void {
    const activeElement = this.getDocument().activeElement;
    if (!(activeElement instanceof this.getWindow().HTMLElement)) return;
    if (!activeElement.matches(EDITOR_SELECTOR)) return;

    const block = activeElement.closest<HTMLElement>(BLOCK_SELECTOR);
    const container = this.getEditorContainer(activeElement);
    if (!block || !container) return;

    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    if (
      activeElement instanceof this.getWindow().HTMLTextAreaElement ||
      activeElement instanceof this.getWindow().HTMLInputElement
    ) {
      selectionStart = activeElement.selectionStart;
      selectionEnd = activeElement.selectionEnd;
    }

    this.editorBookmarks.set(container, {
      block,
      blockId: this.getBlockId(block),
      selectionStart,
      selectionEnd,
    });
  }

  private releaseEditorOutside(targetContainer: HTMLElement): void {
    const activeElement = this.getDocument().activeElement;
    if (!(activeElement instanceof this.getWindow().HTMLElement)) return;
    if (!activeElement.matches(EDITOR_SELECTOR)) return;
    if (targetContainer.contains(activeElement)) return;

    activeElement.blur();
  }

  private scheduleEditorRestore(container: HTMLElement): void {
    if (this.pendingEditorFrame !== null) {
      window.cancelAnimationFrame(this.pendingEditorFrame);
    }

    this.pendingEditorFrame = window.requestAnimationFrame(() => {
      this.pendingEditorFrame = null;
      if (!this.enabled || !container.isConnected) return;
      this.restoreEditor(container);
    });
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
    const target = block.querySelector<HTMLElement>(BLOCK_ACTIVATOR_SELECTOR) ?? block;
    const HostMouseEvent = this.getWindow().MouseEvent;
    const eventOptions: MouseEventInit = {
      bubbles: true,
      cancelable: true,
    };

    target.dispatchEvent(new HostMouseEvent('mousedown', eventOptions));
    target.dispatchEvent(new HostMouseEvent('mouseup', eventOptions));
    target.click();
  }

  private resolveBookmarkedBlock(
    container: HTMLElement,
    bookmark: EditorBookmark | undefined
  ): HTMLElement | null {
    if (!bookmark) return null;
    if (bookmark.block.isConnected && container.contains(bookmark.block)) {
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
