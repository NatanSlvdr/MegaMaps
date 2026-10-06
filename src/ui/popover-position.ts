type Rect = Pick<DOMRect, "left" | "top" | "right" | "bottom">;

// Keep a floating menu inside its panel, even when neither side of the anchor fits.
export function popoverPosition(
  anchor: Rect,
  bounds: Rect,
  size: { width: number; height: number },
) {
  const left = bounds.left + 8;
  const top = bounds.top + 8;
  const right = Math.max(left, bounds.right - 8);
  const bottom = Math.max(top, bounds.bottom - 8);
  const width = Math.min(size.width, right - left);
  const height = Math.min(size.height, bottom - top);
  const below = anchor.bottom + 4;
  const above = anchor.top - height - 4;
  return {
    left: Math.max(left, Math.min(anchor.right - width, right - width)),
    top: Math.max(
      top,
      Math.min(below + height <= bottom ? below : above, bottom - height),
    ),
    width,
    maxHeight: bottom - top,
  };
}
