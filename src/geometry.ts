export type HorizontalWheelInput = {
  shiftKey: boolean;
  deltaX: number;
  deltaY: number;
};

export type HorizontalRect = {
  left: number;
  width: number;
};

export function shouldRemapWheelToHorizontal(input: HorizontalWheelInput): boolean {
  return input.shiftKey && Math.abs(input.deltaY) > Math.abs(input.deltaX);
}

export function scrollLeftForElement(
  container: HorizontalRect,
  element: HorizontalRect,
  currentScrollLeft: number,
  maxScrollLeft: number
): number {
  const containerCenter = container.left + container.width / 2;
  const elementCenter = element.left + element.width / 2;
  const centeredScrollLeft = currentScrollLeft + elementCenter - containerCenter;

  return Math.min(maxScrollLeft, Math.max(0, Math.round(centeredScrollLeft)));
}
