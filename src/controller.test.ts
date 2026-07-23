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

function setLeft(element: HTMLElement, left: number): void {
  element.getBoundingClientRect = () =>
    ({
      left,
      right: left + 680,
      top: 0,
      bottom: 700,
      width: 680,
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
  setLeft(app, 0);

  return { app, list, scrollTo };
}

async function flushMutationAndFrames(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  vi.runOnlyPendingTimers();
  vi.runOnlyPendingTimers();
}

async function flushEditorFrames(): Promise<void> {
  await Promise.resolve();
  for (let frame = 0; frame < 4; frame += 1) {
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
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 1382, behavior: 'smooth' });
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

  it('enters the first editable block when a pane has no remembered editor', async () => {
    const { list } = installFixture();
    const pane = document.createElement('div');
    pane.className = 'sidebar-item';
    pane.innerHTML = `
      <div class="ls-block" blockid="pane-block">
        <div class="block-content">Start writing</div>
      </div>
    `;
    setLeft(pane, 700);
    list.append(pane);

    const block = pane.querySelector<HTMLElement>('.ls-block')!;
    const content = pane.querySelector<HTMLElement>('.block-content')!;
    content.addEventListener('click', () => {
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
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 632, behavior: 'smooth' });
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
