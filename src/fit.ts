// Shrinking a level to fit a short screen. Pure, so it can be tested without
// a browser layout engine.

/** A level is never shrunk below this; on even shorter screens it overflows. */
export const MIN_ZOOM = 0.6

/**
 * Zoom for a level whose content needs `overflow` times the height it has
 * (the largest ratio of content to box among the grid and its cards; 1 or
 * less when everything fits). Only ever shrinks: shrinking widens the columns
 * and changes how the text wraps, so growing back on the next measurement
 * could go back and forth forever. The caller starts again from 1 when the
 * space or the blocks change.
 */
export function fitZoom(overflow: number, current: number): number {
  // A pixel of rounding is not worth shrinking for
  if (!(overflow > 1.01) || current <= MIN_ZOOM) return current
  // Two decimals, rounded down: every step shrinks by at least 0.01
  return Math.max(MIN_ZOOM, Math.min(current - 0.01, Math.floor((current / overflow) * 100) / 100))
}
