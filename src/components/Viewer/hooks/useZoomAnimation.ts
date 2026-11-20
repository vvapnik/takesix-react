import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ZOOM_EASE, ZOOM_MS } from '../../../utils/motion.js'
import type { CardRect } from '../../BlockCard/index.js'

/**
 * The zoom between levels (FLIP). Call `zoomIn` or `zoomOut` before the level
 * changes; the animation runs once the new level is laid out, which is when
 * `layoutKey` changes.
 *
 * - Zooming in, the new screen grows out of the card that was opened.
 * - Zooming out, a copy of the screen being left shrinks into its card on the
 *   level above, measured once that level is laid out, so this works after
 *   opening by a link too, and after a resize.
 *
 * `settleTick` changes when a zoom in ends, so arrows are measured on settled cards.
 */
export function useZoomAnimation(
  slideRef: RefObject<HTMLDivElement | null>,
  cardEls: RefObject<Map<string, HTMLDivElement>>,
  layoutKey: number,
) {
  const pendingFrom = useRef<CardRect | null>(null)
  const pendingGhost = useRef<{ el: HTMLElement; cardId: string } | null>(null)
  const isAnimating = useRef(false)
  const [settleTick, setSettleTick] = useState(0)

  const zoomIn = useCallback((cardRect: CardRect) => { pendingFrom.current = cardRect }, [])

  const zoomOut = useCallback((cardId: string) => {
    const slide = slideRef.current
    const host = slide?.parentElement
    if (!slide || !host) return
    const s = slide.getBoundingClientRect()
    const h = host.getBoundingClientRect()
    const ghost = slide.cloneNode(true) as HTMLElement
    ghost.removeAttribute('id')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.dataset.ghost = ''
    Object.assign(ghost.style, {
      position: 'absolute', margin: '0', zIndex: '5', pointerEvents: 'none', transformOrigin: 'center center',
      left: `${s.left - h.left}px`, top: `${s.top - h.top}px`, width: `${s.width}px`, height: `${s.height}px`,
    })
    host.appendChild(ghost)
    pendingGhost.current = { el: ghost, cardId }
  }, [slideRef])

  // Runs synchronously after DOM update, before paint
  useLayoutEffect(() => {
    const slide = slideRef.current
    if (!slide) return

    const ghost = pendingGhost.current
    pendingGhost.current = null
    if (ghost) {
      // Zoom out: the copy of the left screen shrinks into its card on the
      // level now shown. Measured on the next frame, after the level's fit
      // zoom has settled (that re-renders before the frame is painted).
      isAnimating.current = true
      requestAnimationFrame(() => {
        const card = cardEls.current.get(ghost.cardId)
        const done = () => { ghost.el.remove(); isAnimating.current = false }
        if (!card) { done(); return }
        const from = ghost.el.getBoundingClientRect()
        const to = card.getBoundingClientRect()
        // The same zoom as into a block, the left screen fading out in its last third
        ghost.el.style.transition = `transform ${ZOOM_MS}ms ${ZOOM_EASE}, opacity ${ZOOM_MS / 3}ms linear ${(ZOOM_MS * 2) / 3}ms`
        ghost.el.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - (from.top + from.height / 2)}px) scale(${to.width / from.width}, ${to.height / from.height})`
        ghost.el.style.opacity = '0'
        setTimeout(done, ZOOM_MS + 30)
      })
    }

    const from = pendingFrom.current
    pendingFrom.current = null
    if (!from) return

    // Measure where the slide now sits (full-screen target)
    const to = slide.getBoundingClientRect()
    if (!to.width || !to.height) return

    const sx = from.width / to.width
    const sy = from.height / to.height
    const dx = (from.left + from.width / 2) - (to.left + to.width / 2)
    const dy = (from.top + from.height / 2) - (to.top + to.height / 2)

    // Snap to card position
    slide.style.transition = 'none'
    slide.style.transformOrigin = 'center center'
    slide.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`

    // Force reflow
    slide.getBoundingClientRect()

    // Animate to natural position
    requestAnimationFrame(() => {
      slide.style.transition = `transform ${ZOOM_MS}ms ${ZOOM_EASE}`
      slide.style.transform = ''
      // Only the slide's own zoom ends the animation: transitions of the cards
      // inside (hover under the cursor) bubble up here too, and settling on
      // one of them would stop the zoom midway and route the arrows from
      // the still shrunk cards.
      const onEnd = (e: TransitionEvent) => {
        if (e.target !== slide || e.propertyName !== 'transform') return
        slide.removeEventListener('transitionend', onEnd)
        slide.style.transition = ''
        slide.style.transformOrigin = ''
        setSettleTick(t => t + 1)
      }
      slide.addEventListener('transitionend', onEnd)
    })
    // Only a new level starts an animation; the refs are read as they are then
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  return { zoomIn, zoomOut, isAnimating, settleTick }
}
