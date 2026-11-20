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
    if (!grid || !area) return
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, editing, zoom, typographyTick, ...ticks])
}
