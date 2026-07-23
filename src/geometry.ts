export type HorizontalWheelInput = {
  shiftKey: boolean;
  deltaX: number;
  deltaY: number;
};

export type RectEdges = {
  left: number;
};

export function shouldRemapWheelToHorizontal(input: HorizontalWheelInput): boolean {
  return input.shiftKey && Math.abs(input.deltaY) > Math.abs(input.deltaX);
}

export function scrollLeftForElement(
  container: RectEdges,
  element: RectEdges,
  currentScrollLeft: number,
  leadingGap: number
): number {
  const nextLeft = currentScrollLeft + element.left - container.left - leadingGap;

  return Math.max(0, Math.round(nextLeft));
}
