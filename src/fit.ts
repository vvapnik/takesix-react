// Shrinking a level to fit a short screen. Pure, so it can be tested without
// a browser layout engine.

import type { Rect } from './geometry.js'

/** A level is never shrunk below this; on even shorter screens it overflows. */
export const MIN_ZOOM = 0.6

/**
 * Zoom for a level so that its rows fit the height it has. Only ever shrinks:
 * shrinking widens the columns and changes how the text wraps, so growing back
 * on the next measurement could go back and forth forever. The caller starts
 * again from 1 when the space or the blocks change.
 *
 * Works on screen rects, which already include the current zoom: `available`
 * is the height of the grid, `items` its children, `rowGap` the gap between
 * rows in CSS pixels before zoom.
 */
export function fitZoom(available: number, items: Rect[], rowGap: number, current: number): number {
  if (available <= 0 || !items.length || current <= MIN_ZOOM) return current

  // Items of one row share their top
  const rows = new Map<number, number>()
  for (const item of items) {
    const top = Math.round(item.top)
    rows.set(top, Math.max(rows.get(top) ?? 0, item.height))
  }
  let content = (rows.size - 1) * rowGap * current
  for (const height of rows.values()) content += height
  if (content <= available) return current

  // Two decimals, rounded down: every step shrinks by at least 0.01
  return Math.max(MIN_ZOOM, Math.floor(current * (available / content) * 100) / 100)
}
