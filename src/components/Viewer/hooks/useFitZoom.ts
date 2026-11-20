import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { Block } from '@takesix/core'
import { fitZoom } from '../../../utils/fit.js'
import { clampDescription } from '../layout.js'

/**
 * Shrinks the level when it does not fit: a card whose title and footer
 * alone are taller than its cells (longer text ends in "…" instead), or
 * (compact phone grid) rows taller than the screen. CSS zoom re-lays it
 * out, so card rects, arrows and the zoom animation all see the shrunk cards.
 * fitZoom only shrinks; with new space or new blocks it starts again from 1.
 * The editor keeps the zoom the view chose, so switching modes moves nothing.
 * Runs during the zoom animation too, so an opened level already has its
 * zoom on the first frame: layout sizes do not see the animation's transform.
 *
 * The zoom is the viewer's state (`zoom`, `setZoom`): arrows are routed again
 * when it changes, and their effect runs before this one, as it always has.
 * `ticks` are the other things that change sizes (resize, animation end, a new level).
 */
export function useFitZoom(
  viewerRef: RefObject<HTMLDivElement | null>,
  gridRef: RefObject<HTMLDivElement | null>,
  gridAreaRef: RefObject<HTMLDivElement | null>,
  cardEls: RefObject<Map<string, HTMLDivElement>>,
  blocks: Block[],
  editing: boolean,
  typographyTick: number,
  zoom: number,
  setZoom: (zoom: number) => void,
  ticks: unknown[],
): void {
  const fitFor = useRef('')

  useLayoutEffect(() => {
    const grid = gridRef.current
    const area = gridAreaRef.current
    const viewer = viewerRef.current
    if (!grid || !area || !viewer) return
    // Measured at the height the screen gives the level, then grown to the grid
    viewer.style.removeProperty('--ts-grow')
    try { fit(grid, area) } finally { growToGrid(viewer, area) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, editing, zoom, typographyTick, ...ticks])

  function fit(grid: HTMLDivElement, area: HTMLDivElement) {
    // The area, not the grid: the grid's own sizes change with its zoom
    const key = `${area.clientWidth}x${area.clientHeight}|${blocks.map(b => b.id).join()}|${typographyTick}`
    if (key !== fitFor.current) {
      fitFor.current = key
      if (zoom !== 1) { setZoom(1); return }
    }
    if (editing) return
    const overflowOf = (el: HTMLElement) => (el.clientHeight ? el.scrollHeight / el.clientHeight : 1)
    const overflow = Math.max(...[grid, ...cardEls.current.values()].map(overflowOf))
    const next = fitZoom(overflow, zoom)
    // A card's text gives way to its footer (see .header) and does not shrink
    // the level: a description that does not fit ends with "…" after the
    // lines that fit, measured in full (last time's "…" taken off first)
    const texts = [...cardEls.current.values()].flatMap(el => [...el.querySelectorAll<HTMLElement>('[data-fit]')])
    for (const el of texts) el.removeAttribute('data-clipped')
    for (const el of texts) if (overflowOf(el) > 1.01) clampDescription(el)
    if (next !== zoom) setZoom(next)
  }
}

/**
 * A grid taller than its area (the grid's least height on a short screen, or
 * a phone's rows as tall as their content) makes the whole viewer that much
 * taller (see .viewer), so the whole TakeSix scrolls instead of the level, and
 * an embedding frame sees the height it needs. The area is a size container,
 * so its content alone does not stretch it.
 */
function growToGrid(viewer: HTMLElement, area: HTMLElement) {
  if (area.scrollHeight - area.clientHeight <= 1) return
  // scrollHeight leaves out the padding below a flex column's content
  const cut = area.scrollHeight + (parseFloat(getComputedStyle(area).paddingBottom) || 0) - area.clientHeight
  viewer.style.setProperty('--ts-grow', `${Math.ceil(cut)}px`)
}
