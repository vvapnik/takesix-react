import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  MAX_BLOCKS_PER_LEVEL,
  buildIndex,
  getLevel,
  visibleLinks,
  type Block,
  type Layout,
  type TakeSixDocument,
  type VisibleLink,
} from '@takesix/core'
import { BlockCard, type CardRect } from './BlockCard.js'
import { routeArrows, type ArrowPath, type Rect } from './geometry.js'
import { CircleLayoutIcon, ListIcon, PlusIcon, TilesIcon } from './icons.js'
import styles from './Viewer.module.css'

/** Edits the viewer asks for. All of them are optional: without one, the matching control is hidden. */
export interface ViewerActions {
  rename: (id: string, title: string) => void
  describe: (id: string, description: string) => void
  remove: (id: string) => void
  /** Adds an empty block under `parentId` (`null` = top level). */
  add: (parentId: string | null) => void
  setLayout: (parentId: string | null, layout: Layout) => void
  /** Links `fromId` → `toId`, or removes that link when it exists. */
  toggleLink: (fromId: string, toId: string) => void
}

interface Props {
  document: TakeSixDocument
  editing: boolean
  actions: ViewerActions
}

interface PathEntry {
  id: string
  /** Screen rect of the card that was drilled into, for the zoom animation. */
  cardRect?: CardRect
}

interface Arrow extends ArrowPath {
  link: VisibleLink
  label?: string
}

const LAYOUTS: Array<{ layout: Layout; label: string; Icon: () => ReactElement }> = [
  { layout: 'tiles', label: 'Tiles', Icon: TilesIcon },
  { layout: 'list', label: 'List', Icon: ListIcon },
  { layout: 'circle', label: 'Circle', Icon: CircleLayoutIcon },
]

function arrowLabel(link: VisibleLink): string | undefined {
  const labels = [...new Set(link.links.map(l => l.label).filter((l): l is string => !!l))]
  if (link.links.length > 2) return `${link.links.length} links`
  return labels.length ? labels.join(', ') : undefined
}

function toRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

export function Viewer({ document: doc, editing, actions }: Props) {
  const slideRef = useRef<HTMLDivElement>(null)
  const pendingFrom = useRef<CardRect | null>(null)
  const needsReset = useRef(false)
  const isAnimating = useRef(false)
  const cardElsMap = useRef(new Map<string, HTMLDivElement>())
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const circleContainerRef = useRef<HTMLDivElement>(null)
  const markerId = useId()

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([])
  const [circleSize, setCircleSize] = useState({ w: 0, h: 0 })
  const [path, setPath] = useState<PathEntry[]>([])
  const [layoutKey, setLayoutKey] = useState(0)
  const [sizeTick, setSizeTick] = useState(0)
  // Bumped when the zoom animation ends, so arrows are measured on settled cards.
  const [settleTick, setSettleTick] = useState(0)

  const index = useMemo(() => buildIndex(doc), [doc])

  // Drop path entries whose blocks no longer exist (e.g. after deletion).
  const livePath = useMemo(() => {
    const cut = path.findIndex(p => !index.has(p.id))
    return cut === -1 ? path : path.slice(0, cut)
  }, [path, index])
  useEffect(() => {
    if (livePath !== path) setPath(livePath)
  }, [livePath, path])

  const parentId = livePath.length ? livePath[livePath.length - 1]!.id : null
  const parent: Block | undefined = parentId === null ? undefined : index.get(parentId)?.block
  const blocks = useMemo(
    () => getLevel(doc, parentId, index).slice(0, MAX_BLOCKS_PER_LEVEL),
    [doc, parentId, index],
  )
  const links = useMemo(() => visibleLinks(doc, parentId, index), [doc, parentId, index])
  const isNested = parentId !== null
  const currentLayout: Layout = (parent ? parent.layout : doc.layout) ?? 'tiles'
  const canAdd = editing && blocks.length < MAX_BLOCKS_PER_LEVEL

  // FLIP: runs synchronously after DOM update, before paint
  useLayoutEffect(() => {
    const slide = slideRef.current
    if (!slide) return

    if (needsReset.current) {
      // After zoom-out: snap slide back to natural position with parent content
      needsReset.current = false
      slide.style.transition = 'none'
      slide.style.transform = ''
      slide.style.transformOrigin = ''
      slide.getBoundingClientRect()
      slide.style.transition = ''
      return
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
      slide.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
      slide.style.transform = ''
      slide.addEventListener('transitionend', () => {
        slide.style.transition = ''
        slide.style.transformOrigin = ''
        setSettleTick(t => t + 1)
      }, { once: true })
    })
  }, [layoutKey])

  // Cancel connecting when leaving edit mode
  useEffect(() => {
    if (!editing) setConnectingFrom(null)
  }, [editing])

  // ESC cancels connecting
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setConnectingFrom(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Recompute arrow paths after blocks/layout settle
  useEffect(() => {
    // If a FLIP zoom-in transform is currently applied, getBoundingClientRect would
    // return animated (wrong) positions. Clear arrows and defer until animation ends.
    const slide = slideRef.current
    // During the animation either the transform or the transition is set.
    const flipInProgress = !!(slide && (slide.style.transform !== '' || slide.style.transition !== ''))

    function compute() {
      const container = gridAreaRef.current
      if (!container || !links.length) { setArrowPaths([]); return }
      const rects = new Map<string, Rect>()
      for (const [id, el] of cardElsMap.current) rects.set(id, toRect(el.getBoundingClientRect()))
      setArrowPaths(routeArrows(
        links.map(l => ({ key: l.key, fromId: l.from, toId: l.to })),
        rects,
        toRect(container.getBoundingClientRect()),
      ))
    }

    if (flipInProgress) {
      // Hide arrows during the animation. transitionend bumps settleTick and
      // re-runs this effect; the timer is a fallback if it never fires.
      setArrowPaths([])
      const timer = setTimeout(compute, 1500)
      return () => clearTimeout(timer)
    }

    compute()
  }, [blocks, links, layoutKey, editing, circleSize, sizeTick, settleTick])

  // Re-route arrows when the viewer is resized
  useEffect(() => {
    const el = gridAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (currentLayout !== 'circle') return
    const el = circleContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      setCircleSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [currentLayout])

  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardElsMap.current.set(id, el)
    else cardElsMap.current.delete(id)
  }, [])

  const arrows: Arrow[] = useMemo(() => {
    const byKey = new Map(links.map(l => [l.key, l]))
    return arrowPaths.flatMap(p => {
      const link = byKey.get(p.key)
      return link ? [{ ...p, link, label: arrowLabel(link) }] : []
    })
  }, [arrowPaths, links])

  const circlePositions: Array<{ x: number; y: number }> = (() => {
    if (currentLayout !== 'circle' || circleSize.w === 0) return []
    const { w, h } = circleSize
    const n = blocks.length
    const r = Math.min(w, h) * 0.38
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2
      return { x: w / 2 + r * Math.cos(angle), y: h / 2 + r * Math.sin(angle) }
    })
  })()

  // Direct links from the connecting source, to highlight already linked targets.
  const linkedFromSource = useMemo(() => {
    if (!connectingFrom) return new Set<string>()
    return new Set((doc.links ?? []).filter(l => l.from === connectingFrom).map(l => l.to))
  }, [doc.links, connectingFrom])

  function drillIn(block: Block, cardRect: CardRect) {
    pendingFrom.current = cardRect
    setPath(p => [...p, { id: block.id, cardRect }])
    setLayoutKey(k => k + 1)
  }

  function addChildAndDrillIn(block: Block, cardRect: CardRect) {
    actions.add(block.id)
    drillIn(block, cardRect)
  }

  function goBack(depth: number) {
    if (depth >= livePath.length) return
    const toRect = livePath[livePath.length - 1]?.cardRect
    const slide = slideRef.current

    if (toRect && slide) {
      const from = slide.getBoundingClientRect()
      const sx = toRect.width / from.width
      const sy = toRect.height / from.height
      const dx = (toRect.left + toRect.width / 2) - (from.left + from.width / 2)
      const dy = (toRect.top + toRect.height / 2) - (from.top + from.height / 2)

      slide.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.8, 0)'
      slide.style.transformOrigin = 'center center'
      slide.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`

      isAnimating.current = true
      setTimeout(() => {
        isAnimating.current = false
        needsReset.current = true
        setPath(p => p.slice(0, depth))
        setLayoutKey(k => k + 1)
      }, 370)
    } else {
      setPath(p => p.slice(0, depth))
      setLayoutKey(k => k + 1)
    }
  }

  function connectTarget(id: string) {
    if (!connectingFrom) return
    actions.toggleLink(connectingFrom, id)
    setConnectingFrom(null)
  }

  const crumbs = [{ label: doc.title }, ...livePath.map(p => ({ label: index.get(p.id)?.block.title ?? '' }))]

  const renderCard = (block: Block, layout: Layout) => (
    <BlockCard
      key={block.id}
      block={block}
      layout={layout}
      editing={editing}
      onRename={actions.rename}
      onDescribe={actions.describe}
      onDelete={actions.remove}
      onAddChild={addChildAndDrillIn}
      onDrillIn={drillIn}
      connectingFrom={connectingFrom}
      isConnected={linkedFromSource.has(block.id)}
      onStartConnect={id => setConnectingFrom(id === connectingFrom ? null : id)}
      onConnectTarget={connectTarget}
      onRegisterEl={registerCard}
    />
  )

  const addButton = (extraClass = '') => (
    <button
      className={`${styles.addBlock} ${extraClass}`}
      onClick={() => actions.add(parentId)}
      aria-label="Add block"
    >
      <PlusIcon />
    </button>
  )

  return (
    <div className={styles.viewer}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        {crumbs.map((crumb, i) => (
          <span key={i} className={styles.crumbItem}>
            {i > 0 && <span className={styles.crumbSep}>/</span>}
            <button
              className={`${styles.crumb} ${i === crumbs.length - 1 ? styles.crumbActive : ''}`}
              onClick={() => goBack(i)}
              disabled={i === crumbs.length - 1}
              aria-current={i === crumbs.length - 1 ? 'location' : undefined}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </nav>

      {isNested && (
        <div
          className={styles.backdrop}
          onClick={() => { if (!isAnimating.current) goBack(livePath.length - 1) }}
          aria-hidden="true"
        />
      )}

      {/* slide stays mounted — FLIP transforms this element */}
      <div
        ref={slideRef}
        className={`${styles.slide} ${isNested ? styles.slideCard : ''}`}
      >
        {parent && (
          <div className={styles.slideHeader}>
            {parent.icon && <span className={styles.slideIcon}>{parent.icon}</span>}
            <div className={styles.slideHeaderText}>
              <h2 className={styles.slideTitle}>{parent.title}</h2>
              {parent.description && <p className={styles.slideDescription}>{parent.description}</p>}
            </div>
          </div>
        )}

        <div ref={gridAreaRef} className={`${styles.gridArea} ${isNested ? styles.gridAreaNested : ''}`}>
          {editing && (
            <div className={styles.layoutToggle} role="group" aria-label="Layout">
              {LAYOUTS.map(({ layout, label, Icon }) => (
                <button
                  key={layout}
                  className={`${styles.layoutBtn} ${currentLayout === layout ? styles.layoutBtnActive : ''}`}
                  onClick={() => actions.setLayout(parentId, layout)}
                  aria-label={`${label} layout`}
                  aria-pressed={currentLayout === layout}
                  title={label}
                >
                  <Icon />
                </button>
              ))}
            </div>
          )}

          {currentLayout === 'circle' ? (
            <div ref={circleContainerRef} className={styles.circleGrid}>
              {blocks.map((block, i) => {
                const pos = circlePositions[i]
                return (
                  <div
                    key={block.id}
                    className={styles.circleItem}
                    style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
                  >
                    {renderCard(block, 'tiles')}
                  </div>
                )
              })}
              {canAdd && addButton(styles.addBlockCenter)}
            </div>
          ) : (
            <div
              className={styles.grid}
              data-layout={currentLayout}
              data-count={currentLayout === 'tiles' ? blocks.length + (canAdd ? 1 : 0) : undefined}
            >
              {blocks.map(block => renderCard(block, currentLayout))}
              {canAdd && addButton()}
            </div>
          )}

          {blocks.length === 0 && !editing && (
            <p className={styles.empty}>Nothing here yet</p>
          )}

          {arrows.length > 0 && (
            <svg className={styles.arrowSvg} aria-hidden="true">
              <defs>
                <marker id={markerId} markerWidth="10" markerHeight="8" refX="5" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                  <path d="M 0 0 L 10 4 L 0 8 Z" className={styles.arrowHead} />
                </marker>
              </defs>
              {arrows.map(a => (
                <g key={a.key} data-link={a.key}>
                  <path
                    d={a.d}
                    className={`${styles.arrow} ${a.link.direct ? '' : styles.arrowIndirect}`}
                    markerEnd={a.link.direction !== 'none' ? `url(#${markerId})` : undefined}
                    markerStart={a.link.direction === 'both' ? `url(#${markerId})` : undefined}
                  />
                  {a.label && (
                    <text x={a.mid.x} y={a.mid.y} className={styles.arrowLabel} textAnchor="middle" dominantBaseline="middle">
                      {a.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
