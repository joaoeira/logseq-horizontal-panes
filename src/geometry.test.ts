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
  it('positions an element at the requested leading gap', () => {
    expect(scrollLeftForElement({ left: 0 }, { left: 900 }, 100, 24)).toBe(976);
  });

  it('never returns a negative scroll position', () => {
    expect(scrollLeftForElement({ left: 100 }, { left: 20 }, 0, 24)).toBe(0);
  });
});
