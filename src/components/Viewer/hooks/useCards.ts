import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/**
 * The cards of the level by block id, and a tick that changes when the level's
 * area or any card changes size, so arrows and the fit zoom are measured again.
 */
export function useCards(gridAreaRef: RefObject<HTMLDivElement | null>) {
  const cardEls = useRef(new Map<string, HTMLDivElement>())
  const [sizeTick, setSizeTick] = useState(0)

  // Re-route arrows when the viewer or any card changes size
  const resizeObserver = useRef<ResizeObserver | null>(null)
  useEffect(() => {
    const el = gridAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    resizeObserver.current = ro
    ro.observe(el)
    for (const card of cardEls.current.values()) ro.observe(card)
    return () => { ro.disconnect(); resizeObserver.current = null }
  }, [gridAreaRef])

  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    const old = cardEls.current.get(id)
    if (old) resizeObserver.current?.unobserve(old)
    if (el) {
      cardEls.current.set(id, el)
      resizeObserver.current?.observe(el)
    } else {
      cardEls.current.delete(id)
    }
  }, [])

  return { cardEls, registerCard, sizeTick }
}
