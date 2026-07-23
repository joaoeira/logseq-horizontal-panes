import { describe, expect, it } from 'vitest';
import { scrollLeftForElement, shouldRemapWheelToHorizontal } from './geometry';

describe('shouldRemapWheelToHorizontal', () => {
  it('maps a shifted vertical wheel gesture', () => {
    expect(shouldRemapWheelToHorizontal({ shiftKey: true, deltaX: 0, deltaY: 120 })).toBe(true);
  });

  it('leaves ordinary vertical scrolling alone', () => {
    expect(shouldRemapWheelToHorizontal({ shiftKey: false, deltaX: 0, deltaY: 120 })).toBe(false);
  });

  it('leaves a native horizontal trackpad gesture alone', () => {
    expect(shouldRemapWheelToHorizontal({ shiftKey: true, deltaX: 120, deltaY: 10 })).toBe(false);
  });
});

describe('scrollLeftForElement', () => {
  it('centers an element in the visible container', () => {
    expect(
      scrollLeftForElement(
        { left: 0, width: 1000 },
        { left: 900, width: 600 },
        100,
        2000
      )
    ).toBe(800);
  });

  it('clamps centering at the start of the scroll range', () => {
    expect(
      scrollLeftForElement(
        { left: 100, width: 1000 },
        { left: 20, width: 600 },
        0,
        2000
      )
    ).toBe(0);
  });

  it('clamps centering at the end of the scroll range', () => {
    expect(
      scrollLeftForElement(
        { left: 0, width: 1000 },
        { left: 2000, width: 600 },
        0,
        1600
      )
    ).toBe(1600);
  });
});
