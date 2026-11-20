import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** How long to wait for the stylesheet before showing the diagram anyway. */
const STYLES_TIMEOUT = 3000

/**
 * Whether the diagram may be shown: its stylesheet is applied and the fonts
 * its text needs have loaded. Until then it is laid out but invisible, so the
 * first thing people see is the final layout, not text that reflows and a
 * level that zooms again. `tick` changes whenever fonts finish loading later
 * (text measured with a fallback font must be measured again).
 *
 * Without a browser font API (tests, server rendering) it is ready at once.
 */
export function useTypographyReady(root: RefObject<HTMLElement | null>): { ready: boolean; tick: number } {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  const [ready, setReady] = useState(!fonts)
  const [tick, setTick] = useState(0)

  // After the first layout, which is what starts loading the fonts the text
  // uses: when nothing is pending, this shows the diagram before the first paint.
  useLayoutEffect(() => {
    if (ready || !fonts) return
    let live = true
    const started = performance.now()
    const check = () => {
      if (!live) return
      const el = root.current
      // Our stylesheet defines the theme variables on the root element
      const styled = !el || getComputedStyle(el).getPropertyValue('--ts-bg').trim() !== ''
      if (!styled && performance.now() - started < STYLES_TIMEOUT) {
        requestAnimationFrame(check)
      } else if (fonts.status === 'loading') {
        fonts.ready.then(check)
      } else {
        setReady(true)
      }
    }
    // Forces the layout that requests the fonts
    root.current?.getBoundingClientRect()
    check()
    return () => { live = false }
  }, [ready, fonts, root])

  useEffect(() => {
    if (!fonts) return
    const onDone = () => setTick(t => t + 1)
    fonts.addEventListener('loadingdone', onDone)
    return () => fonts.removeEventListener('loadingdone', onDone)
  }, [fonts])

  return { ready, tick }
}
