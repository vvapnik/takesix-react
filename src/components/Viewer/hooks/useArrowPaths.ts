import { useLayoutEffect, useState, type RefObject } from 'react'
import type { Block, VisibleLink } from '@takesix/core'
import { routeArrows, type ArrowPath, type Rect } from '../../../utils/geometry.js'
import { toRect } from '../arrows.js'

/**
 * Routes the level's arrows between the cards as they are drawn. A layout
 * effect, so the first paint already has the arrows. `ticks` are the other
 * things that move cards (mode, resize, zoom, fonts): a change routes again.
 */
export function useArrowPaths(
  slideRef: RefObject<HTMLDivElement | null>,
  gridAreaRef: RefObject<HTMLDivElement | null>,
  cardEls: RefObject<Map<string, HTMLDivElement>>,
  blocks: Block[],
  links: VisibleLink[],
  ticks: unknown[],
): ArrowPath[] {
  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([])

  useLayoutEffect(() => {
    // If a FLIP zoom-in transform is currently applied, getBoundingClientRect would
    // return animated (wrong) positions. Clear arrows and defer until animation ends.
    const slide = slideRef.current
    // During the animation either the transform or the transition is set.
    const flipInProgress = !!(slide && (slide.style.transform !== '' || slide.style.transition !== ''))

    function compute() {
      const container = gridAreaRef.current
      if (!container || !links.length) { setArrowPaths([]); return }
      const rects = new Map<string, Rect>()
      for (const [id, el] of cardEls.current) rects.set(id, toRect(el.getBoundingClientRect()))
      setArrowPaths(routeArrows(
        links.map(l => ({
          key: l.key,
          fromId: l.from,
          toId: l.to,
          headAtStart: l.direction === 'both',
          headAtEnd: l.direction !== 'none',
        })),
        rects,
        toRect(container.getBoundingClientRect()),
        new Map(blocks.flatMap(b => (b.shape === 'decision' || b.shape === 'io' ? [[b.id, b.shape] as const] : []))),
      ))
    }

    if (flipInProgress) {
      // Hide arrows during the animation. The end of the animation changes a
      // tick and re-runs this effect; the timer is a fallback if it never does.
      setArrowPaths([])
      const timer = setTimeout(compute, 1500)
      return () => clearTimeout(timer)
    }

    compute()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, links, ...ticks])

  return arrowPaths
}
