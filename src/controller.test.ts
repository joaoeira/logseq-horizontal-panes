// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorizontalPanesController } from './controller';

const options = {
  mainWidthPx: 620,
  paneWidthPx: 680,
  paneGapPx: 18,
  mainPaneGapPx: 32,
  scrollSnap: false,
};

function setLeft(element: HTMLElement, left: number, width = 680): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      right: left + width,
      top: 0,
      bottom: 700,
      width,
      height: 700,
      x: left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function installFixture(): {
  app: HTMLElement;
  list: HTMLElement;
  scrollTo: ReturnType<typeof vi.fn>;
} {
  document.body.innerHTML = `
    <div id="app-container">
      <div id="left-container"></div>
      <div id="right-sidebar" class="open">
        <div class="sidebar-item-list"></div>
      </div>
    </div>
  `;

  const app = document.querySelector<HTMLElement>('#app-container')!;
  const list = document.querySelector<HTMLElement>('.sidebar-item-list')!;
  const scrollTo = vi.fn(({ left }: ScrollToOptions) => {
    app.scrollLeft = left ?? app.scrollLeft;
  });
  app.scrollTo = scrollTo as unknown as typeof app.scrollTo;
  Object.defineProperties(app, {
    clientWidth: { configurable: true, value: 1000 },
    scrollWidth: { configurable: true, value: 3000 },
  });
  setLeft(app, 0, 1000);

  return { app, list, scrollTo };
}

async function flushMutationAndFrames(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();
}

async function flushEditorFrames(): Promise<void> {
  for (let frame = 0; frame < 4; frame += 1) {
    await Promise.resolve();
    vi.runOnlyPendingTimers();
  }
}

describe('HorizontalPanesController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
      window.setTimeout(() => callback(0), 0);
    window.cancelAnimationFrame = (handle: number): void => window.clearTimeout(handle);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    document.body.removeAttribute('style');
    vi.useRealTimers();
  });

  it('activates the host layout without modifying pane ownership', () => {
    installFixture();
    const controller = new HorizontalPanesController(options);

    controller.setEnabled(true);

    expect(document.body.classList.contains('horizontal-panes-active')).toBe(true);
    expect(document.body.style.getPropertyValue('--horizontal-panes-main-width')).toBe('620px');
    expect(document.body.style.getPropertyValue('--horizontal-panes-pane-width')).toBe('680px');
    expect(document.body.style.getPropertyValue('--horizontal-panes-gap')).toBe('18px');
    expect(document.body.style.getPropertyValue('--horizontal-panes-main-gap')).toBe('32px');
    controller.destroy();
  });

  it('focuses a newly prepended native pane at its visual right-hand position', async () => {
    const { list, scrollTo } = installFixture();
    const olderPane = document.createElement('div');
    olderPane.className = 'sidebar-item';
    setLeft(olderPane, 700);
    list.append(olderPane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    const newestPane = document.createElement('div');
    newestPane.className = 'sidebar-item';
    setLeft(newestPane, 1400);
    list.prepend(newestPane);
    await flushMutationAndFrames();

    expect(newestPane.classList.contains('horizontal-panes-active-pane')).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1240, behavior: 'smooth' });
    expect(list.children[0]).toBe(newestPane);
    controller.destroy();
  });

  it('maps shifted vertical wheel input to the shared horizontal container', () => {
    const { app } = installFixture();
    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    document.dispatchEvent(
      new WheelEvent('wheel', {
        shiftKey: true,
        deltaY: 120,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(app.scrollLeft).toBe(120);
    controller.destroy();
  });

  it('focuses panes from left to right and treats the main page as the leftmost target', () => {
    const { list } = installFixture();
    const newestPane = document.createElement('div');
    const oldestPane = document.createElement('div');
    newestPane.className = 'sidebar-item';
    oldestPane.className = 'sidebar-item';
    setLeft(oldestPane, 650);
    setLeft(newestPane, 1350);
    list.append(newestPane, oldestPane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    controller.focusAdjacentPane(1);
    expect(oldestPane.classList.contains('horizontal-panes-active-pane')).toBe(true);

    controller.focusAdjacentPane(1);
    expect(newestPane.classList.contains('horizontal-panes-active-pane')).toBe(true);

    controller.focusAdjacentPane(-1);
    expect(oldestPane.classList.contains('horizontal-panes-active-pane')).toBe(true);

    controller.focusAdjacentPane(-1);
    expect(list.querySelector('.horizontal-panes-active-pane')).toBeNull();
    controller.destroy();
  });

  it('reorders the focused pane visually without moving Logseq-owned DOM nodes', () => {
    const { list } = installFixture();
    const newestPane = document.createElement('div');
    const middlePane = document.createElement('div');
    const oldestPane = document.createElement('div');
    newestPane.className = 'sidebar-item';
    middlePane.className = 'sidebar-item';
    oldestPane.className = 'sidebar-item';
    list.append(newestPane, middlePane, oldestPane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);
    middlePane.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(controller.moveActivePane(-1)).toBe(true);
    expect(oldestPane.style.order).toBe('1');
    expect(middlePane.style.order).toBe('0');
    expect(newestPane.style.order).toBe('2');
    expect(Array.from(list.children)).toEqual(
      expect.arrayContaining([newestPane, middlePane, oldestPane])
    );
    expect(list.children[0]).toBe(newestPane);

    expect(controller.moveActivePane(1)).toBe(true);
    expect(oldestPane.style.order).toBe('0');
    expect(middlePane.style.order).toBe('1');
    expect(newestPane.style.order).toBe('2');
    controller.destroy();
  });

  it('restores the last caret position when moving between pane editors', async () => {
    const { list } = installFixture();
    const main = document.querySelector<HTMLElement>('#left-container')!;
    main.innerHTML = `
      <div class="ls-block" blockid="main-block">
        <div class="block-editor"><textarea>main text</textarea></div>
      </div>
    `;

    const pane = document.createElement('div');
    pane.className = 'sidebar-item';
    pane.innerHTML = `
      <div class="ls-block" blockid="pane-block">
        <div class="block-editor"><textarea>pane text</textarea></div>
      </div>
    `;
    setLeft(pane, 700);
    list.append(pane);

    const mainEditor = main.querySelector<HTMLTextAreaElement>('textarea')!;
    const paneEditor = pane.querySelector<HTMLTextAreaElement>('textarea')!;
    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    mainEditor.focus();
    mainEditor.setSelectionRange(2, 4);
    controller.focusAdjacentPane(1);

    expect(document.activeElement).not.toBe(mainEditor);
    await flushEditorFrames();

    expect(document.activeElement).toBe(paneEditor);
    expect(paneEditor.selectionStart).toBe(paneEditor.value.length);

    paneEditor.setSelectionRange(1, 3);
    controller.focusAdjacentPane(-1);

    expect(document.activeElement).not.toBe(paneEditor);
    await flushEditorFrames();

    expect(document.activeElement).toBe(mainEditor);
    expect(mainEditor.selectionStart).toBe(2);
    expect(mainEditor.selectionEnd).toBe(4);
    controller.destroy();
  });

  it('waits for Logseq to commit the outgoing editor before restoring another one', async () => {
    const { list } = installFixture();
    const main = document.querySelector<HTMLElement>('#left-container')!;
    main.innerHTML = `
      <div class="ls-block" blockid="main-block">
        <div class="block-editor"><textarea>fresh main content</textarea></div>
      </div>
    `;

    const pane = document.createElement('div');
    pane.className = 'sidebar-item';
    pane.innerHTML = `
      <div class="ls-block" blockid="pane-block">
        <div class="block-content">
          <span class="block-title-wrap">pane content</span>
        </div>
      </div>
    `;
    setLeft(pane, 700);
    list.append(pane);

    const block = pane.querySelector<HTMLElement>('.ls-block')!;
    const title = pane.querySelector<HTMLElement>('.block-title-wrap')!;
    title.addEventListener('pointerdown', () => {
      if (block.querySelector('textarea')) return;
      const editor = document.createElement('textarea');
      editor.className = 'block-editor';
      editor.value = 'pane content';
      block.append(editor);
    });

    let finishCommit!: () => void;
    const commitFinished = new Promise<void>((resolve) => {
      finishCommit = resolve;
    });
    const commitCurrentEditor = vi.fn(() => commitFinished);
    const controller = new HorizontalPanesController(options, {
      commitCurrentEditor,
    });
    controller.setEnabled(true);

    const mainEditor = main.querySelector<HTMLTextAreaElement>('textarea')!;
    mainEditor.focus();
    controller.focusAdjacentPane(1);
    await flushEditorFrames();

    expect(commitCurrentEditor).toHaveBeenCalledOnce();
    expect(pane.classList.contains('horizontal-panes-active-pane')).toBe(true);
    expect(pane.querySelector('textarea')).toBeNull();

    finishCommit();
    await Promise.resolve();
    await flushEditorFrames();

    expect(document.activeElement).toBe(pane.querySelector('textarea'));
    controller.destroy();
  });

  it('keeps a rapid reverse navigation behind the same pending content commit', async () => {
    const { list } = installFixture();
    const main = document.querySelector<HTMLElement>('#left-container')!;
    main.innerHTML = `
      <div class="ls-block" blockid="main-block">
        <div class="block-editor"><textarea>fresh main content</textarea></div>
      </div>
    `;

    const pane = document.createElement('div');
    pane.className = 'sidebar-item';
    pane.innerHTML = `
      <div class="ls-block" blockid="pane-block">
        <div class="block-editor"><textarea>pane content</textarea></div>
      </div>
    `;
    setLeft(pane, 700);
    list.append(pane);

    let finishCommit!: () => void;
    const commitFinished = new Promise<void>((resolve) => {
      finishCommit = resolve;
    });
    const controller = new HorizontalPanesController(options, {
      commitCurrentEditor: () => commitFinished,
    });
    controller.setEnabled(true);

    const mainEditor = main.querySelector<HTMLTextAreaElement>('textarea')!;
    mainEditor.focus();
    controller.focusAdjacentPane(1);
    controller.focusAdjacentPane(-1);
    await flushEditorFrames();

    expect(document.activeElement).not.toBe(mainEditor);

    finishCommit();
    await Promise.resolve();
    await flushEditorFrames();

    expect(document.activeElement).toBe(mainEditor);
    controller.destroy();
  });

  it('remembers a pane editor when a mouse transition blurs it before switching', async () => {
    const { list } = installFixture();
    const rightPane = document.createElement('div');
    const leftPane = document.createElement('div');
    rightPane.className = 'sidebar-item';
    leftPane.className = 'sidebar-item';
    rightPane.innerHTML = `
      <div class="ls-block" blockid="right-block">
        <div class="block-editor"><textarea>right text</textarea></div>
      </div>
    `;
    leftPane.innerHTML = `
      <div class="ls-block" blockid="left-block">
        <div class="block-content">left text</div>
        <div class="block-editor"><textarea>left text</textarea></div>
      </div>
    `;
    setLeft(leftPane, 650);
    setLeft(rightPane, 1350);
    list.append(rightPane, leftPane);

    const leftBlock = leftPane.querySelector<HTMLElement>('.ls-block')!;
    const leftContent = leftPane.querySelector<HTMLElement>('.block-content')!;
    const originalLeftEditor = leftPane.querySelector<HTMLTextAreaElement>('textarea')!;
    const rightEditor = rightPane.querySelector<HTMLTextAreaElement>('textarea')!;
    leftContent.addEventListener('click', () => {
      if (leftBlock.querySelector('textarea')) return;
      const editor = document.createElement('textarea');
      editor.className = 'block-editor';
      editor.value = 'left text';
      leftBlock.append(editor);
    });

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    originalLeftEditor.focus();
    originalLeftEditor.setSelectionRange(1, 4);
    originalLeftEditor.blur();
    originalLeftEditor.remove();
    rightEditor.focus();

    controller.focusAdjacentPane(-1);
    await flushEditorFrames();

    const restoredLeftEditor = leftPane.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(document.activeElement).toBe(restoredLeftEditor);
    expect(restoredLeftEditor.selectionStart).toBe(1);
    expect(restoredLeftEditor.selectionEnd).toBe(4);
    controller.destroy();
  });

  it('enters the first editable block when a pane has no remembered editor', async () => {
    const { list } = installFixture();
    const pane = document.createElement('div');
    pane.className = 'sidebar-item';
    pane.innerHTML = `
      <div class="ls-block" blockid="pane-block">
        <div class="block-content">
          <span class="block-title-wrap">Start writing</span>
        </div>
      </div>
    `;
    setLeft(pane, 700);
    list.append(pane);

    const block = pane.querySelector<HTMLElement>('.ls-block')!;
    const title = pane.querySelector<HTMLElement>('.block-title-wrap')!;
    title.addEventListener('pointerdown', () => {
      const editor = document.createElement('textarea');
      editor.className = 'block-editor';
      editor.value = 'Start writing';
      block.append(editor);
    });

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);
    controller.focusAdjacentPane(1);
    await flushEditorFrames();

    expect(document.activeElement).toBe(pane.querySelector('textarea'));
    controller.destroy();
  });

  it('consumes the bracket shortcuts before Logseq and uses Shift to reorder', () => {
    const { list, scrollTo } = installFixture();
    const newestPane = document.createElement('div');
    const oldestPane = document.createElement('div');
    newestPane.className = 'sidebar-item';
    oldestPane.className = 'sidebar-item';
    setLeft(oldestPane, 650);
    setLeft(newestPane, 1350);
    list.append(newestPane, oldestPane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    const ordinaryBracket = new KeyboardEvent('keydown', {
      code: 'BracketRight',
      key: ']',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(ordinaryBracket);
    expect(ordinaryBracket.defaultPrevented).toBe(false);
    expect(list.querySelector('.horizontal-panes-active-pane')).toBeNull();

    const focusRight = new KeyboardEvent('keydown', {
      code: 'BracketRight',
      key: ']',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(focusRight);

    expect(focusRight.defaultPrevented).toBe(true);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 490, behavior: 'smooth' });
    expect(list.querySelector('.horizontal-panes-active-pane')).toBe(oldestPane);

    const moveRight = new KeyboardEvent('keydown', {
      code: 'BracketRight',
      key: '}',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(moveRight);

    expect(moveRight.defaultPrevented).toBe(true);
    expect(oldestPane.style.order).toBe('1');
    expect(newestPane.style.order).toBe('0');
    controller.destroy();
  });
});
