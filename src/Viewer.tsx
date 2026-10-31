import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_BLOCKS_PER_LEVEL,
  buildIndex,
  getLevel,
  visibleLinks,
  type Block,
  type Size,
  type Link,
  type TakeSixDocument,
  type VisibleLink,
} from '@takesix/core'
import { BlockCard, type CardRect, type DropPosition } from './BlockCard.js'
import { HEAD_LENGTH, routeArrows, type ArrowPath, type Rect } from './geometry.js'
import { LinkPopover, type LinkEdit } from './LinkPopover.js'
import { DetailsPanel } from './DetailsPanel.js'
import { DetailsIcon, PlusIcon } from './icons.js'
import styles from './Viewer.module.css'

/** Edits the viewer asks for. All of them are optional: without one, the matching control is hidden. */
export interface ViewerActions {
  rename: (id: string, title: string) => void
  describe: (id: string, description: string) => void
  remove: (id: string) => void
  /** Adds an empty block under `parentId` (`null` = top level). */
  add: (parentId: string | null) => void
  /** Sets a block's width on its level. */
  setSize: (id: string, size: Size) => void
  /** Links `fromId` → `toId`, or removes that link when it exists. */
  toggleLink: (fromId: string, toId: string) => void
  /** Moves a block to position `index` among the children of `parentId`. */
  move: (id: string, parentId: string | null, index: number) => void
  /** Edits one link, found by identity (links in files may have no id). */
  updateLink: (link: Link, changes: LinkEdit) => void
  removeLink: (link: Link) => void
  /** Saves a block's Markdown details; an empty string removes them. */
  setDetails: (id: string, details: string) => void
  /** Wraps sibling blocks into a new parent block, freeing room on the level. */
  group: (ids: string[]) => void
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

function arrowLabel(link: VisibleLink): string | undefined {
  const labels = [...new Set(link.links.map(l => l.label).filter((l): l is string => !!l))]
  if (link.links.length > 2) return `${link.links.length} links`
  return labels.length ? labels.join(', ') : undefined
}

/** Same for a→b and b→a, so reversing a link keeps its editor open. */
function pairKey(link: VisibleLink): string {
  return [link.from, link.to].sort().join('|')
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
  const markerId = useId()

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // Blocks chosen for grouping; null when not grouping
  const [grouping, setGrouping] = useState<string[] | null>(null)
  // Arrow whose links are being edited, by its pair of blocks (see pairKey)
  const [openArrow, setOpenArrow] = useState<string | null>(null)
  const closeArrow = useCallback(() => setOpenArrow(null), [])
  // Block whose details panel is open
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const closeDetails = useCallback(() => setDetailsId(null), [])
  const [drop, setDrop] = useState<{ id: string; position: DropPosition } | null>(null)
  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([])
  const [path, setPath] = useState<PathEntry[]>([])
  const [layoutKey, setLayoutKey] = useState(0)
  const [sizeTick, setSizeTick] = useState(0)
  // Bumped when the zoom animation ends, so arrows are measured on settled cards.
  const [settleTick, setSettleTick] = useState(0)

  const index = useMemo(() => buildIndex(doc), [doc])
  // Gone when the block is deleted: the panel closes by itself
  const detailsBlock = detailsId ? index.get(detailsId)?.block : undefined

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

  // Cancel connecting and close the link editor when leaving edit mode
  useEffect(() => {
    if (!editing) {
      setConnectingFrom(null)
      setOpenArrow(null)
      setGrouping(null)
    }
  }, [editing])

  // Grouping is about one level: leaving it cancels
  useEffect(() => setGrouping(null), [parentId])

  // Close the link editor when its arrow goes away (level changed, links deleted)
  useEffect(() => {
    if (openArrow && !links.some(l => pairKey(l) === openArrow)) setOpenArrow(null)
  }, [links, openArrow])

  // ESC cancels connecting
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setConnectingFrom(null)
      setGrouping(null)
    }
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
        links.map(l => ({
          key: l.key,
          fromId: l.from,
          toId: l.to,
          headAtStart: l.direction === 'both',
          headAtEnd: l.direction !== 'none',
        })),
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
  }, [blocks, links, layoutKey, editing, sizeTick, settleTick])

  // Re-route arrows when the viewer or any card changes size
  const resizeObserver = useRef<ResizeObserver | null>(null)
  useEffect(() => {
    const el = gridAreaRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setSizeTick(t => t + 1))
    resizeObserver.current = ro
    ro.observe(el)
    for (const card of cardElsMap.current.values()) ro.observe(card)
    return () => { ro.disconnect(); resizeObserver.current = null }
  }, [])

  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    const old = cardElsMap.current.get(id)
    if (old) resizeObserver.current?.unobserve(old)
    if (el) {
      cardElsMap.current.set(id, el)
      resizeObserver.current?.observe(el)
    } else {
      cardElsMap.current.delete(id)
    }
  }, [])

  const arrows: Arrow[] = useMemo(() => {
    const byKey = new Map(links.map(l => [l.key, l]))
    return arrowPaths.flatMap(p => {
      const link = byKey.get(p.key)
      return link ? [{ ...p, link, label: arrowLabel(link) }] : []
    })
  }, [arrowPaths, links])

  // While linking, the target may sit on any level, except the source's own
  // ancestors and descendants: such a link would never be visible.
  const canLinkTo = useCallback((id: string) => {
    if (!connectingFrom || id === connectingFrom) return false
    const source = index.get(connectingFrom)
    const target = index.get(id)
    if (!source || !target) return false
    return !source.path.includes(id) && !target.path.includes(connectingFrom)
  }, [connectingFrom, index])
  const linkSource = connectingFrom ? index.get(connectingFrom)?.block : undefined

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

  function endDrag() {
    setDragId(null)
    setDrop(null)
  }

  // Drop on the current indicator. Works over the gaps too, since the
  // indicator stays on the last card the pointer was over.
  function commitDrop() {
    if (dragId && drop && drop.id !== dragId) {
      const rest = blocks.map(b => b.id).filter(id => id !== dragId)
      const at = rest.indexOf(drop.id) + (drop.position === 'after' ? 1 : 0)
      if (at !== blocks.findIndex(b => b.id === dragId)) actions.move(dragId, parentId, at)
    }
    endDrag()
  }

  const dropZone = editing ? {
    onDragOver: (e: React.DragEvent) => { if (dragId) e.preventDefault() },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); commitDrop() },
  } : {}

  function connectTarget(id: string) {
    if (!connectingFrom) return
    actions.toggleLink(connectingFrom, id)
    setConnectingFrom(null)
  }

  const crumbs = [{ label: doc.title }, ...livePath.map(p => ({ label: index.get(p.id)?.block.title ?? '' }))]

  const renderCard = (block: Block) => (
    <BlockCard
      key={block.id}
      block={block}
      editing={editing}
      onRename={actions.rename}
      onDescribe={actions.describe}
      onDelete={actions.remove}
      onAddChild={addChildAndDrillIn}
      onDrillIn={drillIn}
      connectingFrom={connectingFrom}
      canLinkTo={canLinkTo(block.id)}
      isConnected={linkedFromSource.has(block.id)}
      onStartConnect={id => setConnectingFrom(id === connectingFrom ? null : id)}
      onConnectTarget={connectTarget}
      onRegisterEl={registerCard}
      isDragged={dragId === block.id}
      dropPosition={dragId && drop?.id === block.id && drop.id !== dragId ? drop.position : null}
      onDragStartBlock={setDragId}
      onDragOverBlock={(id, position) => {
        if (!dragId) return
        if (drop?.id !== id || drop.position !== position) setDrop({ id, position })
      }}
      onDragEndBlock={endDrag}
      onShowDetails={setDetailsId}
      selectable={grouping !== null}
      selected={grouping?.includes(block.id) ?? false}
      onToggleSelect={id => setGrouping(g => g && (g.includes(id) ? g.filter(x => x !== id) : [...g, id]))}
      onResize={actions.setSize}
    />
  )

  const addButton = () => (
    <button
      className={styles.addBlock}
      onClick={() => actions.add(parentId)}
      aria-label="Add block"
    >
      <PlusIcon />
    </button>
  )

  return (
    <div className={styles.viewer}>
      {/* Only below the top level: there the header already names the document.
          The strip around the crumbs zooms out one level, like the backdrop. */}
      {isNested && <nav
        className={styles.breadcrumb}
        aria-label="Breadcrumb"
        onClick={e => {
          if ((e.target as HTMLElement).closest('button')) return
          if (!isAnimating.current) goBack(livePath.length - 1)
        }}
      >
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
      </nav>}

      {grouping && (
        <div className={styles.linkBar} role="status">
          <span>
            Select blocks to group: <strong>{grouping.length}</strong> selected
          </span>
          <button
            className={styles.linkBarCancel}
            disabled={grouping.length < 2}
            onClick={() => { actions.group(grouping); setGrouping(null) }}
          >
            Group
          </button>
          <button className={styles.linkBarCancel} onClick={() => setGrouping(null)}>Cancel</button>
        </div>
      )}

      {linkSource && (
        <div className={styles.linkBar} role="status">
          <span>
            Linking from <strong>{linkSource.title}</strong>: click a block on any level
          </span>
          <button className={styles.linkBarCancel} onClick={() => setConnectingFrom(null)}>Cancel</button>
        </div>
      )}

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
        {/* Header: the document on the top level, the opened block below it */}
        {(() => {
          const head = parent ?? { title: doc.title, description: doc.description, icon: undefined }
          return (
            <div className={`${styles.slideHeader} ${parent ? '' : styles.slideHeaderTop}`}>
              {head.icon && <span className={styles.slideIcon}>{head.icon}</span>}
              <div className={styles.slideHeaderText}>
                <h1 className={styles.slideTitle}>{head.title}</h1>
                {head.description && <p className={styles.slideDescription}>{head.description}</p>}
              </div>
              {parent && (editing || parent.details?.trim()) && (
                <button
                  className={styles.headerDetailsBtn}
                  onClick={() => setDetailsId(parent.id)}
                  aria-label={`Details of ${parent.title}`}
                >
                  <DetailsIcon /> {parent.details?.trim() ? 'Details' : 'Add details'}
                </button>
              )}
            </div>
          )
        })()}

        <div ref={gridAreaRef} className={`${styles.gridArea} ${isNested ? styles.gridAreaNested : ''}`}>
          {editing && blocks.length >= 2 && (
            <div className={styles.levelTools} role="group" aria-label="Level tools">
              <button
                className={`${styles.groupBtn} ${grouping ? styles.groupBtnActive : ''}`}
                onClick={() => {
                  setConnectingFrom(null)
                  setGrouping(g => (g ? null : []))
                }}
                aria-pressed={grouping !== null}
              >
                Group blocks
              </button>
              {blocks.length >= MAX_BLOCKS_PER_LEVEL && !grouping && (
                <span className={styles.fullHint}>
                  {blocks.length} of {MAX_BLOCKS_PER_LEVEL}: group blocks to add more
                </span>
              )}
            </div>
          )}

          {/* One flow for every level: blocks take 2, 3, 4 or 6 of 6 columns by size */}
          <div className={styles.grid} {...dropZone}>
            {blocks.map(block => renderCard(block))}
            {canAdd && addButton()}
          </div>

          {blocks.length === 0 && !editing && (
            <p className={styles.empty}>Nothing here yet</p>
          )}

          {arrows.length > 0 && (
            <svg className={`${styles.arrowSvg} ${editing ? styles.arrowSvgEditing : ''}`} aria-hidden={editing ? undefined : true}>
              <defs>
                {/* Base of the head at the path end (refX 0): the head continues the line. */}
                <marker id={markerId} markerWidth={HEAD_LENGTH} markerHeight="8" refX="0" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                  <path d={`M 0 0 L ${HEAD_LENGTH} 4 L 0 8 Z`} className={styles.arrowHead} />
                </marker>
              </defs>
              {arrows.map(a => (
                <g key={a.key} data-link={a.key}>
                  {editing && (
                    // Wide invisible stroke: easy to hit, opens the link editor
                    <path
                      d={a.d}
                      className={styles.arrowHit}
                      role="button"
                      aria-label={`Edit link ${index.get(a.link.from)?.block.title ?? a.link.from} – ${index.get(a.link.to)?.block.title ?? a.link.to}`}
                      onClick={e => { e.stopPropagation(); setOpenArrow(pairKey(a.link)) }}
                    />
                  )}
                  <path
                    d={a.d}
                    className={`${styles.arrow} ${a.link.direct ? '' : styles.arrowIndirect}`}
                    markerEnd={a.link.direction !== 'none' ? `url(#${markerId})` : undefined}
                    markerStart={a.link.direction === 'both' ? `url(#${markerId})` : undefined}
                  />
                  {a.label && (
                    // Vertical arrows often cross a narrow gap between rows: label beside the arrow.
                    <text
                      x={a.vertical ? a.mid.x + 8 : a.mid.x}
                      y={a.mid.y}
                      className={`${styles.arrowLabel} ${openArrow === pairKey(a.link) ? styles.arrowLabelOpen : ''}`}
                      onClick={editing ? e => { e.stopPropagation(); setOpenArrow(pairKey(a.link)) } : undefined}
                      textAnchor={a.vertical ? 'start' : 'middle'}
                      dominantBaseline="middle"
                    >
                      {a.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          )}

          {(() => {
            const open = editing && arrows.find(a => pairKey(a.link) === openArrow)
            if (!open) return null
            return (
              <LinkPopover
                links={open.link.links}
                x={open.mid.x}
                y={open.mid.y}
                titleOf={id => index.get(id)?.block.title ?? id}
                onUpdate={actions.updateLink}
                onRemove={actions.removeLink}
                onClose={closeArrow}
              />
            )
          })()}
        </div>
      </div>

      {/* Outside the slide: full height on the right, on any level */}
      {detailsBlock && (
        <DetailsPanel
          block={detailsBlock}
          editing={editing}
          onChange={details => actions.setDetails(detailsBlock.id, details)}
          onClose={closeDetails}
        />
      )}
    </div>
  )
}
