// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HorizontalPanesController } from './controller';

const options = {
  mainWidthPx: 620,
  paneWidthPx: 680,
  paneGapPx: 18,
  mainPaneGapPx: 32,
  scrollSnap: false,
  openPaneLinks: false,
};

const navigationOptions = {
  ...options,
  openPaneLinks: true,
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

function createBlockPane(blockId: string, childBlockId?: string): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'sidebar-item item-type-block';
  pane.innerHTML = `
    <div class="sidebar-item-header">
      <span class="pane-title">${blockId}</span>
      <span class="item-actions"><button class="close">Close</button></span>
    </div>
    <div class="blocks-list-wrap">
      <div class="ls-block" blockid="${blockId}">
        <div class="block-content">${blockId}</div>
        ${
          childBlockId
            ? `<div class="ls-block" blockid="${childBlockId}">
                <span class="bullet-container" blockid="${childBlockId}">
                  <span class="bullet" blockid="${childBlockId}"></span>
                </span>
                <div class="block-content">${childBlockId}</div>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
  pane.querySelector('.close')?.addEventListener('click', () => pane.remove());
  return pane;
}

function createPagePane(pageName: string): HTMLElement {
  const pane = document.createElement('div');
  pane.className = 'sidebar-item item-type-page';
  pane.innerHTML = `
    <div class="sidebar-item-header">
      <button aria-controls="page-content">${pageName}</button>
      <span class="item-actions"><button class="close">Close</button></span>
    </div>
    <div class="blocks-list-wrap">
      <div class="ls-block" blockid="${pageName}-first-block"></div>
    </div>
  `;
  pane.querySelector('.close')?.addEventListener('click', () => pane.remove());
  return pane;
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  {
    pointerId = 1,
    shiftKey = false,
    clientX = 100,
    clientY = 100,
  }: {
    pointerId?: number;
    shiftKey?: boolean;
    clientX?: number;
    clientY?: number;
  } = {}
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    shiftKey,
    clientX,
    clientY,
  });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  target.dispatchEvent(event);
  return event;
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
    expect(
      document.body.style.getPropertyValue('--horizontal-panes-last-pane-max-width')
    ).toBe('850px');
    expect(document.body.style.getPropertyValue('--horizontal-panes-gap')).toBe('18px');
    expect(document.body.style.getPropertyValue('--horizontal-panes-main-gap')).toBe('32px');
    controller.destroy();
  });

  it('adds disabled Back and Forward controls to each native pane header', () => {
    const { list } = installFixture();
    const pane = createBlockPane('A');
    const nativeActions = pane.querySelector<HTMLElement>('.item-actions')!;
    list.append(pane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    const controls = pane.querySelector<HTMLElement>(
      '.horizontal-panes-history-controls'
    );
    const back = pane.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="back"]'
    );
    const forward = pane.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="forward"]'
    );

    expect(controls).not.toBeNull();
    expect(controls?.nextElementSibling).toBe(nativeActions);
    expect(back?.getAttribute('aria-label')).toBe('Back in pane');
    expect(forward?.getAttribute('aria-label')).toBe('Forward in pane');
    expect(back?.disabled).toBe(true);
    expect(forward?.disabled).toBe(true);
    controller.destroy();
  });

  it('restores pane history controls after Logseq rerenders a native header', () => {
    const { list } = installFixture();
    const pane = createBlockPane('A');
    list.append(pane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);
    pane.querySelector('.horizontal-panes-history-controls')?.remove();

    vi.advanceTimersByTime(400);

    expect(pane.querySelector('.horizontal-panes-history-controls')).not.toBeNull();
    controller.destroy();
  });

  it('moves a replaced pane backward and forward through its own history', async () => {
    const { list } = installFixture();
    const paneA = createBlockPane('A', 'B');
    list.append(paneA);
    const openPaneReference = vi.fn(async (target: string | number) => {
      list.prepend(createBlockPane(String(target)));
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneA.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown');
    dispatchPointer(childBullet, 'pointerup');
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const paneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    const back = paneB.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="back"]'
    )!;
    expect(back.disabled).toBe(false);

    back.click();
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual(['B', 'A']);
    const restoredPaneA = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="A"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    const forward = restoredPaneA.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="forward"]'
    )!;
    expect(list.querySelectorAll(':scope > .sidebar-item')).toHaveLength(1);
    expect(restoredPaneA.style.order).toBe('0');
    expect(
      restoredPaneA.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )?.disabled
    ).toBe(true);
    expect(forward.disabled).toBe(false);

    forward.click();
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const restoredPaneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual([
      'B',
      'A',
      'B',
    ]);
    expect(
      restoredPaneB.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )?.disabled
    ).toBe(false);
    expect(
      restoredPaneB.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="forward"]'
      )?.disabled
    ).toBe(true);
    controller.destroy();
  });

  it('navigates the focused pane history through the public command interface', async () => {
    const { list } = installFixture();
    const paneA = createBlockPane('A', 'B');
    list.append(paneA);
    const openPaneReference = vi.fn(async (target: string | number) => {
      list.prepend(createBlockPane(String(target)));
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneA.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown');
    dispatchPointer(childBullet, 'pointerup');
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    expect(controller.navigateActivePaneHistory('back')).toBe(true);
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const restoredPaneA = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="A"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual(['B', 'A']);
    expect(restoredPaneA.classList.contains('horizontal-panes-active-pane')).toBe(
      true
    );
    expect(controller.navigateActivePaneHistory('forward')).toBe(true);
    await flushMutationAndFrames();
    await flushMutationAndFrames();
    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual([
      'B',
      'A',
      'B',
    ]);
    controller.destroy();
  });

  it('discards the old Forward branch after navigating from a historical target', async () => {
    const { list } = installFixture();
    const paneA = createBlockPane('A', 'B');
    list.append(paneA);
    let openedB = 0;
    const openPaneReference = vi.fn(async (target: string | number) => {
      const blockId = String(target);
      const childBlockId =
        blockId === 'B' ? (++openedB === 1 ? 'C' : 'D') : undefined;
      list.prepend(createBlockPane(blockId, childBlockId));
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const navigateBullet = async (pane: HTMLElement): Promise<void> => {
      const bullet = pane.querySelector<HTMLElement>('.bullet')!;
      dispatchPointer(bullet, 'pointerdown');
      dispatchPointer(bullet, 'pointerup');
      await flushMutationAndFrames();
      await flushMutationAndFrames();
    };

    await navigateBullet(paneA);
    const firstPaneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    await navigateBullet(firstPaneB);

    const paneC = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="C"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    paneC
      .querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )!
      .click();
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const historicalPaneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    await navigateBullet(historicalPaneB);

    const paneD = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="D"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual([
      'B',
      'C',
      'B',
      'D',
    ]);
    expect(
      paneD.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="forward"]'
      )?.disabled
    ).toBe(true);
    controller.destroy();
  });

  it('restores a pane scroll position and caret when returning through history', async () => {
    const { list } = installFixture();
    const createEditablePane = (blockId: string, childBlockId?: string): HTMLElement => {
      const pane = createBlockPane(blockId, childBlockId);
      const rootBlock = pane.querySelector<HTMLElement>(
        `.ls-block[blockid="${blockId}"]`
      )!;
      const editor = document.createElement('textarea');
      editor.className = 'block-editor';
      editor.value = `${blockId} editable text`;
      rootBlock.append(editor);
      return pane;
    };
    const paneA = createEditablePane('A', 'B');
    list.append(paneA);
    const openPaneReference = vi.fn(async (target: string | number) => {
      list.prepend(createEditablePane(String(target)));
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    paneA.scrollTop = 140;
    const editorA = paneA.querySelector<HTMLTextAreaElement>('textarea')!;
    editorA.focus();
    editorA.setSelectionRange(2, 5);
    const childBullet = paneA.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown');
    dispatchPointer(childBullet, 'pointerup');
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const paneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    paneB
      .querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )!
      .click();
    await flushMutationAndFrames();
    await flushMutationAndFrames();
    await flushEditorFrames();

    const restoredPaneA = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="A"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    const restoredEditor = restoredPaneA.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(restoredPaneA.scrollTop).toBe(140);
    expect(document.activeElement).toBe(restoredEditor);
    expect(restoredEditor.selectionStart).toBe(2);
    expect(restoredEditor.selectionEnd).toBe(5);
    controller.destroy();
  });

  it('keeps a pane manual width while navigating through its history', async () => {
    const { list } = installFixture();
    const paneA = createBlockPane('A', 'B');
    paneA.classList.add('horizontal-panes-manual-width');
    paneA.style.setProperty('--horizontal-panes-pane-width-override', '920px');
    list.append(paneA);
    const openPaneReference = vi.fn(async (target: string | number) => {
      list.prepend(createBlockPane(String(target)));
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneA.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown');
    dispatchPointer(childBullet, 'pointerup');
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const paneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    expect(paneB.classList.contains('horizontal-panes-manual-width')).toBe(true);
    expect(
      paneB.style.getPropertyValue('--horizontal-panes-pane-width-override')
    ).toBe('920px');

    paneB
      .querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )!
      .click();
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const restoredPaneA = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="A"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    expect(restoredPaneA.classList.contains('horizontal-panes-manual-width')).toBe(
      true
    );
    expect(
      restoredPaneA.style.getPropertyValue('--horizontal-panes-pane-width-override')
    ).toBe('920px');
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

  it('keeps visual pane order when Logseq removes and re-adds the same pane node', async () => {
    const { list } = installFixture();
    const rightPane = createBlockPane('right');
    const leftPane = createBlockPane('left');
    list.append(rightPane, leftPane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    list.removeChild(leftPane);
    list.append(leftPane);
    await flushMutationAndFrames();

    expect(leftPane.style.order).toBe('0');
    expect(rightPane.style.order).toBe('1');
    controller.destroy();
  });

  it('focuses an already-open block target without changing panes after a shaky plain-click', async () => {
    const { list } = installFixture();
    const paneD = createBlockPane('D');
    const paneC = createBlockPane('C');
    const paneB = createBlockPane('B', 'D');
    const paneA = createBlockPane('A');
    list.append(paneD, paneC, paneB, paneA);
    const openPaneReference = vi.fn(async () => undefined);

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneB.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown', { clientX: 100 });
    dispatchPointer(childBullet, 'pointermove', { clientX: 108 });
    dispatchPointer(childBullet, 'pointerup', { clientX: 108 });
    await flushMutationAndFrames();

    expect(openPaneReference).not.toHaveBeenCalled();
    expect(paneB.isConnected).toBe(true);
    expect(paneA.style.order).toBe('0');
    expect(paneB.style.order).toBe('1');
    expect(paneC.style.order).toBe('2');
    expect(paneD.style.order).toBe('3');
    expect(paneD.classList.contains('horizontal-panes-active-pane')).toBe(true);
    controller.destroy();
  });

  it('focuses an already-open block target without moving it on Shift-click', async () => {
    const { list } = installFixture();
    const paneD = createBlockPane('D');
    const paneC = createBlockPane('C');
    const paneB = createBlockPane('B', 'D');
    const paneA = createBlockPane('A');
    list.append(paneD, paneC, paneB, paneA);
    const openPaneReference = vi.fn(async () => undefined);

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneB.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown', { shiftKey: true });
    dispatchPointer(childBullet, 'pointerup', { shiftKey: true });
    await flushMutationAndFrames();

    expect(openPaneReference).not.toHaveBeenCalled();
    expect(paneB.isConnected).toBe(true);
    expect(paneA.style.order).toBe('0');
    expect(paneB.style.order).toBe('1');
    expect(paneC.style.order).toBe('2');
    expect(paneD.style.order).toBe('3');
    expect(paneD.classList.contains('horizontal-panes-active-pane')).toBe(true);
    controller.destroy();
  });

  it('inserts a genuinely new block pane immediately after its source on Shift-click', async () => {
    const { list } = installFixture();
    const paneC = createBlockPane('C');
    const paneB = createBlockPane('B', 'D');
    const paneA = createBlockPane('A');
    list.append(paneC, paneB, paneA);
    const paneD = createBlockPane('D');
    const openPaneReference = vi.fn(async () => {
      list.prepend(paneD);
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneB.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown', { shiftKey: true });
    dispatchPointer(childBullet, 'pointerup', { shiftKey: true });
    await flushMutationAndFrames();

    expect(openPaneReference).toHaveBeenCalledWith('D');
    expect(paneA.style.order).toBe('0');
    expect(paneB.style.order).toBe('1');
    expect(paneD.style.order).toBe('2');
    expect(paneC.style.order).toBe('3');
    expect(
      paneD.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )?.disabled
    ).toBe(true);
    expect(
      paneD.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="forward"]'
      )?.disabled
    ).toBe(true);
    controller.destroy();
  });

  it('focuses an already-open historical target without consuming pane history', async () => {
    const { list } = installFixture();
    const paneA = createBlockPane('A', 'B');
    list.append(paneA);
    const openPaneReference = vi.fn(async (target: string | number) => {
      list.prepend(createBlockPane(String(target)));
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      openPaneReference,
    });
    controller.setEnabled(true);

    const childBullet = paneA.querySelector<HTMLElement>('.bullet')!;
    dispatchPointer(childBullet, 'pointerdown');
    dispatchPointer(childBullet, 'pointerup');
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const paneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    const separatelyOpenedPaneA = createBlockPane('A');
    list.prepend(separatelyOpenedPaneA);
    await flushMutationAndFrames();

    const back = paneB.querySelector<HTMLButtonElement>(
      'button[data-horizontal-panes-history="back"]'
    )!;
    back.click();
    await flushMutationAndFrames();

    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual(['B']);
    expect(list.querySelectorAll(':scope > .sidebar-item')).toHaveLength(2);
    expect(paneB.isConnected).toBe(true);
    expect(paneB.style.order).toBe('0');
    expect(separatelyOpenedPaneA.style.order).toBe('1');
    expect(separatelyOpenedPaneA.classList.contains('horizontal-panes-active-pane')).toBe(
      true
    );
    expect(back.disabled).toBe(false);
    controller.destroy();
  });

  it('focuses an already-open page target without closing its source pane', async () => {
    const { list } = installFixture();
    const targetPane = createPagePane('Target Page');
    const sourcePane = createBlockPane('Source');
    sourcePane.querySelector('.block-content')!.innerHTML = `
      <span class="page-reference" data-ref="Target Page">
        <a class="page-ref" data-ref="Target Page">Target Page</a>
      </span>
    `;
    list.append(targetPane, sourcePane);
    const resolvePaneReference = vi.fn(async () => 'target-page-uuid');
    const openPaneReference = vi.fn(async () => undefined);

    const controller = new HorizontalPanesController(navigationOptions, {
      resolvePaneReference,
      openPaneReference,
    });
    controller.setEnabled(true);

    const pageReference = sourcePane.querySelector<HTMLElement>('.page-ref')!;
    dispatchPointer(pageReference, 'pointerdown');
    dispatchPointer(pageReference, 'pointerup');
    await flushMutationAndFrames();
    await flushEditorFrames();

    expect(resolvePaneReference).toHaveBeenCalledWith('Target Page');
    expect(openPaneReference).not.toHaveBeenCalled();
    expect(sourcePane.isConnected).toBe(true);
    expect(sourcePane.style.order).toBe('0');
    expect(targetPane.style.order).toBe('1');
    expect(targetPane.classList.contains('horizontal-panes-active-pane')).toBe(true);
    controller.destroy();
  });

  it('returns from a block to an initial page target in the same pane slot', async () => {
    const { list } = installFixture();
    const pagePane = createPagePane('Page A');
    pagePane.querySelector('.ls-block')!.innerHTML = `
      <div class="block-content">
        <span class="page-reference" data-ref="Target B">
          <a class="page-ref" data-ref="Target B">Target B</a>
        </span>
      </div>
    `;
    list.append(pagePane);
    const resolvePaneReference = vi.fn(async (reference: string) =>
      reference === 'Page A' ? 'page-a-uuid' : 'B'
    );
    const openPaneReference = vi.fn(async (target: string | number) => {
      list.prepend(
        String(target) === 'page-a-uuid'
          ? createPagePane('Page A')
          : createBlockPane(String(target))
      );
    });

    const controller = new HorizontalPanesController(navigationOptions, {
      resolvePaneReference,
      openPaneReference,
    });
    controller.setEnabled(true);

    const pageReference = pagePane.querySelector<HTMLElement>('.page-ref')!;
    dispatchPointer(pageReference, 'pointerdown');
    dispatchPointer(pageReference, 'pointerup');
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const paneB = list.querySelector<HTMLElement>(
      '.sidebar-item .ls-block[blockid="B"]'
    )!.closest<HTMLElement>('.sidebar-item')!;
    paneB
      .querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="back"]'
      )!
      .click();
    await flushMutationAndFrames();
    await flushMutationAndFrames();

    const restoredPage = list.querySelector<HTMLElement>(
      '.sidebar-item.item-type-page'
    )!;
    expect(openPaneReference.mock.calls.map(([target]) => target)).toEqual([
      'B',
      'page-a-uuid',
    ]);
    expect(resolvePaneReference.mock.calls.map(([reference]) => reference)).toEqual([
      'Target B',
      'Page A',
    ]);
    expect(restoredPage.style.order).toBe('0');
    expect(
      restoredPage.querySelector<HTMLButtonElement>(
        'button[data-horizontal-panes-history="forward"]'
      )?.disabled
    ).toBe(false);
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

    expect(newestPane.classList.contains('horizontal-panes-last-pane')).toBe(true);

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

    expect(controller.moveActivePane(1)).toBe(true);
    expect(middlePane.style.order).toBe('2');
    expect(middlePane.classList.contains('horizontal-panes-last-pane')).toBe(true);
    expect(newestPane.classList.contains('horizontal-panes-last-pane')).toBe(false);
    controller.destroy();
  });

  it('resizes a pane from a forgiving target outside its right border', () => {
    const { list } = installFixture();
    const pane = document.createElement('div');
    pane.className = 'sidebar-item';
    setLeft(pane, 700);
    list.append(pane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: 1387,
      clientY: 100,
      button: 0,
    });
    Object.defineProperty(pointerDown, 'pointerId', { value: 7 });
    list.dispatchEvent(pointerDown);

    expect(pointerDown.defaultPrevented).toBe(true);
    expect(document.body.classList.contains('horizontal-panes-pane-resizing')).toBe(true);

    const pointerMove = new MouseEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      clientX: 1507,
      clientY: 100,
      buttons: 1,
    });
    Object.defineProperty(pointerMove, 'pointerId', { value: 7 });
    document.dispatchEvent(pointerMove);

    expect(pointerMove.defaultPrevented).toBe(true);
    expect(
      pane.style.getPropertyValue('--horizontal-panes-pane-width-override')
    ).toBe('800px');
    expect(pane.classList.contains('horizontal-panes-manual-width')).toBe(true);

    const pointerUp = new MouseEvent('pointerup', {
      bubbles: true,
      clientX: 1507,
      clientY: 100,
    });
    Object.defineProperty(pointerUp, 'pointerId', { value: 7 });
    document.dispatchEvent(pointerUp);

    expect(document.body.classList.contains('horizontal-panes-pane-resizing')).toBe(false);
    expect(
      pane.style.getPropertyValue('--horizontal-panes-pane-width-override')
    ).toBe('800px');

    pane.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: 1387,
        clientY: 100,
      })
    );

    expect(
      pane.style.getPropertyValue('--horizontal-panes-pane-width-override')
    ).toBe('');
    expect(pane.classList.contains('horizontal-panes-manual-width')).toBe(false);

    controller.destroy();
  });

  it('cleans up session-only pane widths when horizontal mode is disabled', () => {
    const { list } = installFixture();
    const pane = document.createElement('div');
    pane.className = 'sidebar-item horizontal-panes-manual-width';
    pane.style.setProperty('--horizontal-panes-pane-width-override', '900px');
    setLeft(pane, 700);
    list.append(pane);

    const controller = new HorizontalPanesController(options);
    controller.setEnabled(true);
    controller.setEnabled(false);

    expect(
      pane.style.getPropertyValue('--horizontal-panes-pane-width-override')
    ).toBe('');
    expect(pane.classList.contains('horizontal-panes-manual-width')).toBe(false);
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
