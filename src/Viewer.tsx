import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  GRID_SIZE,
  MAX_BLOCKS_PER_LEVEL,
  buildIndex,
  findPlace,
  fitsGrid,
  formatArea,
  getLevel,
  levelAreas,
  levelLayoutIssues,
  overlap,
  readingOrder,
  resolveView,
  sameView,
  viewOfPath,
  visibleLinks,
  type Area,
  type Block,
  type BlockShape,
  type Link,
  type TakeSixDocument,
  type ViewAddress,
  type VisibleLink,
} from '@takesix/core'
import { BlockCard, areaStyle, type CardRect, type Cell } from './BlockCard.js'
import { ZOOM_EASE, ZOOM_MS } from './motion.js'
import { HEAD_LENGTH, HEAD_SWEEP, HEAD_WIDTH, routeArrows, type ArrowPath, type Rect } from './geometry.js'
import { fitZoom } from './fit.js'
import { LinkPopover, type LinkEdit } from './LinkPopover.js'
import { ShapeMenu } from './ShapeMenu.js'
import { TextLevel } from './TextLevel.js'
import { BlockIcon, CheckIcon, LinkIcon, PlusIcon } from './icons.js'
import styles from './Viewer.module.css'

/** Edits the viewer asks for. All of them are optional: without one, the matching control is hidden. */
export interface ViewerActions {
  rename: (id: string, title: string) => void
  describe: (id: string, description: string) => void
  renameDocument: (title: string) => void
  describeDocument: (description: string) => void
  remove: (id: string) => void
  /** Adds an empty block under `parentId` (`null` = top level), at `at` or the first free place. */
  add: (parentId: string | null, at?: string) => void
  /** Moves or resizes a block on its own level. */
  place: (id: string, at: string) => void
  /** Links `fromId` → `toId`, or removes that link when it exists. */
  toggleLink: (fromId: string, toId: string) => void
  /** Moves a block under `parentId`, to `at` or (without it) its own place if free, else the first free one. */
  move: (id: string, parentId: string | null, at?: string) => void
  /** Edits one link, found by identity (links in files may have no id). */
  updateLink: (link: Link, changes: LinkEdit) => void
  removeLink: (link: Link) => void
  /** Saves the Markdown text of a text block (one that opens into `details`). */
  setDetails: (id: string, details: string) => void
  /** Draws a block as a flowchart symbol; `'process'` is the plain card. */
  setShape: (id: string, shape: BlockShape) => void
  /** Turns an empty block into a text block: it then opens into text, not blocks. */
  makeText: (id: string) => void
  /** Turns an empty text block back into one that holds blocks, and adds the first. */
  toBlocks: (id: string) => void
  /** Wraps sibling blocks into a new parent block, freeing room on the level. */
  group: (ids: string[]) => void
}

interface Props {
  document: TakeSixDocument
  editing: boolean
  actions: ViewerActions
  /** Changes when styles or fonts arrive: text is measured again. */
  typographyTick: number
  /** The screen to show. A change from outside (history, a link) moves there. */
  view: ViewAddress
  /** The reader moved to another screen. */
  onNavigate: (view: ViewAddress) => void
  /** Copies a link to a screen; without it blocks have no link button. */
  onCopyLink?: (view: ViewAddress) => Promise<boolean>
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

/** A straight arrow across less space than this joins neighbouring blocks
    (no free cell between them): it is drawn without its label. */
const NEIGHBOUR_GAP = 48

/** Space between a vertical arrow and its label. */
const LABEL_GAP = 8

/** Rough width of a label character (11px, medium weight). */
const LABEL_CHAR = 6.5

/** Horizontal padding of a label's pill, on both sides together. */
const LABEL_PAD = 14

/**
 * The TakeSix arrowhead: a dart whose barbs sweep back along the line, with
 * a notch between them. The tip is where the path's head ends (HEAD_LENGTH
 * past its end); the notch reaches just past the end, so no gap shows.
 */
const HEAD_PATH = `M ${-HEAD_SWEEP} 0 L ${HEAD_LENGTH} ${HEAD_WIDTH / 2} L ${-HEAD_SWEEP} ${HEAD_WIDTH} L 0.5 ${HEAD_WIDTH / 2} Z`

/** Marker attributes for HEAD_PATH: the line's end at x 0 (the notch). */
const HEAD_MARKER = {
  viewBox: `${-HEAD_SWEEP - 1} -1 ${HEAD_LENGTH + HEAD_SWEEP + 2} ${HEAD_WIDTH + 2}`,
  markerWidth: HEAD_LENGTH + HEAD_SWEEP + 2,
  markerHeight: HEAD_WIDTH + 2,
  refX: 0,
  refY: HEAD_WIDTH / 2,
  orient: 'auto-start-reverse',
  markerUnits: 'userSpaceOnUse',
} as const

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

/** Where a dragged block would land: into another block, or on a place of this level. */
type DropTarget = { inside: string } | { area: Area; ok: boolean }

/** Areas of `areas` other than block `id`'s own. */
function othersOf(areas: Map<string, Area>, id: string): Area[] {
  return [...areas].filter(([other]) => other !== id).map(([, a]) => a)
}

const isFree = (area: Area, taken: Area[]) => fitsGrid(area) && taken.every(t => !overlap(t, area))

/**
 * Ends the description in a card's text box (`[data-fit]`, measured in full
 * and too tall) with "…" after the lines that fit. Element sizes only, so
 * the level's zoom does not matter.
 */
function clampDescription(text: HTMLElement) {
  const description = text.querySelector<HTMLElement>('[data-clamp]')
  if (!description) return
  const excess = text.scrollHeight - text.clientHeight
  const full = description.offsetHeight
  text.setAttribute('data-clipped', '')
  description.style.setProperty('--ts-lines', '1')
  const line = description.offsetHeight
  if (!line) return
  const lines = Math.floor((full - excess) / line)
  // Not even one line: the title takes the room, the description goes
  if (lines < 1) text.setAttribute('data-clipped', 'all')
  else description.style.setProperty('--ts-lines', String(lines))
}

/** Area for a new block started in `cell`: half the grid wide when free, else narrower. */
function newBlockArea(cell: Cell, taken: Area[]): Area | undefined {
  for (const width of [3, 2, 1]) {
    const area = { ...cell, width, height: 1 }
    if (isFree(area, taken)) return area
  }
  return undefined
}

export function Viewer({ document: doc, editing, actions, typographyTick, view, onNavigate, onCopyLink }: Props) {
  const slideRef = useRef<HTMLDivElement>(null)
  const pendingFrom = useRef<CardRect | null>(null)
  // Zooming out: a copy of the screen being left, to shrink into its card
  // once the level above is laid out (see the FLIP effect)
  const pendingGhost = useRef<{ el: HTMLElement; cardId: string } | null>(null)
  const isAnimating = useRef(false)
  const cardElsMap = useRef(new Map<string, HTMLDivElement>())
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const markerId = useId()
  const warnMarkerId = useId()

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  // Blocks chosen for grouping; null when not grouping
  const [grouping, setGrouping] = useState<string[] | null>(null)
  // Arrow whose links are being edited, by its pair of blocks (see pairKey)
  const [openArrow, setOpenArrow] = useState<string | null>(null)
  const closeArrow = useCallback(() => setOpenArrow(null), [])
  // Shape picker of one block: where it opens, relative to the level's area
  const [shapeMenu, setShapeMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const closeShapes = useCallback(() => setShapeMenu(null), [])
  const openShapes = useCallback((id: string, button: DOMRect) => {
    const area = gridAreaRef.current?.getBoundingClientRect()
    if (!area) return
    setOpenArrow(null)
    setShapeMenu({ id, x: button.right - area.left, y: button.bottom - area.top })
  }, [])
  const [drop, setDrop] = useState<DropTarget | null>(null)
  // Where the dragged card was grabbed, from its top-left corner
  const dragOffset = useRef({ x: 0, y: 0 })
  // Breadcrumb a dragged block would move up to
  const [dropCrumb, setDropCrumb] = useState<number | null>(null)
  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([])
  // Opened by a link: straight to that screen, no zoom from the top
  const [initial] = useState(() => resolveView(doc, view))
  const [path, setPath] = useState<PathEntry[]>(() => initial.path.map(id => ({ id })))
  // The block an `at` address points at, outlined until the reader moves on
  const [highlight, setHighlight] = useState<string | null>(initial.highlight ?? null)
  // Header link button feedback: copied, failed, or nothing yet
  const [screenCopied, setScreenCopied] = useState<boolean | null>(null)
  useEffect(() => {
    if (screenCopied === null) return
    const timer = setTimeout(() => setScreenCopied(null), 1500)
    return () => clearTimeout(timer)
  }, [screenCopied])
  const [layoutKey, setLayoutKey] = useState(0)
  const [sizeTick, setSizeTick] = useState(0)
  // Bumped when the zoom animation ends, so arrows are measured on settled cards.
  const [settleTick, setSettleTick] = useState(0)
  // Below 1 when the level is taller than the screen (see fitZoom)
  const [zoom, setZoom] = useState(1)

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
  // In reading order: the DOM order is what keyboards and screen readers follow
  const blocks = useMemo(
    () => readingOrder(getLevel(doc, parentId, index)).slice(0, MAX_BLOCKS_PER_LEVEL),
    [doc, parentId, index],
  )
  const areas = useMemo(() => levelAreas(blocks), [blocks])
  const links = useMemo(() => visibleLinks(doc, parentId, index), [doc, parentId, index])
  // Editing: arrows that run through a block or cross each other, with why
  const layoutIssues = useMemo(
    () => (editing ? levelLayoutIssues(doc, parentId, index) : []),
    [doc, parentId, index, editing],
  )
  const arrowWarnings = useMemo(() => {
    const byArrow = new Map<string, string[]>()
    for (const issue of layoutIssues) {
      for (const key of issue.arrows) byArrow.set(key, [...(byArrow.get(key) ?? []), issue.message])
    }
    return byArrow
  }, [layoutIssues])
  const isNested = parentId !== null
  // The opened block holds text, not blocks: its screen reads that text
  const textBlock = parent?.details !== undefined ? parent : undefined
  const isText = textBlock !== undefined
  const canAdd = editing && !isText && blocks.length < MAX_BLOCKS_PER_LEVEL && !!findPlace(areas.values(), 1, 1)

  // The whole 6×6 grid, cells of one size filling the screen, the same when
  // viewing and editing, so nothing moves between the modes. Phones (viewing
  // only) get a compact grid instead: the rows in use, as tall as their
  // content, and empty columns and rows shrunk away (see .grid).
  const usedRows = Math.max(0, ...[...areas.values()].map(a => a.row + a.height))
  const covered = (test: (a: Area) => boolean) => [...areas.values()].some(test)
  // Viewing, the rows below the last block are left out, so the blocks get
  // the room; editing keeps all six to place blocks in
  const fullRows = editing ? GRID_SIZE : Math.max(1, usedRows)
  const gridStyle = {
    gridTemplateColumns: editing
      ? `repeat(${GRID_SIZE}, minmax(0, 1fr))`
      : Array.from({ length: GRID_SIZE }, (_, c) =>
          covered(a => a.col <= c && c < a.col + a.width) ? 'minmax(0, 1fr)' : 'var(--ts-empty-col)').join(' '),
    '--ts-rows-full': `repeat(${fullRows}, minmax(0, 1fr))`,
    // How many times the six rows are taller than the rows shown: the grid
    // keeps the proportions of its cells, not of the whole 6×6 grid
    '--ts-row-share': GRID_SIZE / fullRows,
    '--ts-rows-compact': Array.from({ length: Math.max(1, usedRows) }, (_, r) =>
      covered(a => a.row <= r && r < a.row + a.height) ? 'auto' : '0px').join(' '),
  } as React.CSSProperties

  // FLIP: runs synchronously after DOM update, before paint
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
        const card = cardElsMap.current.get(ghost.cardId)
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
  }, [layoutKey])

  // Cancel connecting and close the link editor when leaving edit mode
  useEffect(() => {
    if (!editing) {
      setConnectingFrom(null)
      setOpenArrow(null)
      setGrouping(null)
      setShapeMenu(null)
    }
  }, [editing])

  // Grouping and linking are about one level: leaving it cancels
  useEffect(() => {
    setGrouping(null)
    setConnectingFrom(null)
    setShapeMenu(null)
  }, [parentId])

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

  // Recompute arrow paths after blocks/layout settle. A layout effect, so the
  // first paint already has the arrows; re-runs when the fit zoom changes.
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
        new Map(blocks.flatMap(b => (b.shape === 'decision' || b.shape === 'io' ? [[b.id, b.shape] as const] : []))),
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
  }, [blocks, links, layoutKey, editing, sizeTick, settleTick, zoom, typographyTick])

  // Shrink the level when it does not fit: a card whose title and footer
  // alone are taller than its cells (longer text ends in "…" instead), or
  // (compact phone grid) rows taller than the screen. CSS zoom re-lays it
  // out, so card rects, arrows and the zoom animation all see the shrunk cards.
  // fitZoom only shrinks; with new space or new blocks it starts again from 1.
  // The editor keeps the zoom the view chose, so switching modes moves nothing.
  // Runs during the zoom animation too, so an opened level already has its
  // zoom on the first frame: layout sizes do not see the animation's transform.
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
    const overflow = Math.max(...[grid, ...cardElsMap.current.values()].map(overflowOf))
    const next = fitZoom(overflow, zoom)
    // A card's text gives way to its footer (see .header) and does not shrink
    // the level: a description that does not fit ends with "…" after the
    // lines that fit, measured in full (last time's "…" taken off first)
    const texts = [...cardElsMap.current.values()].flatMap(el => [...el.querySelectorAll<HTMLElement>('[data-fit]')])
    for (const el of texts) el.removeAttribute('data-clipped')
    for (const el of texts) if (overflowOf(el) > 1.01) clampDescription(el)
    if (next !== zoom) setZoom(next)
  }, [blocks, editing, sizeTick, settleTick, layoutKey, zoom, typographyTick])

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
      if (!link) return []
      // Neighbours (no free cell between them, or one shrunk away on a narrow
      // level): the short arrow has no room for its label
      const label = arrowLabel(link)
      const roomy = p.span === undefined || p.span >= NEIGHBOUR_GAP
      return [{ ...p, link, label: roomy ? label : undefined }]
    })
  }, [arrowPaths, links])

  // While linking, the target is another block of the same level: links
  // across levels are never drawn.
  const canLinkTo = useCallback((id: string) => {
    if (!connectingFrom || id === connectingFrom) return false
    const source = index.get(connectingFrom)
    const target = index.get(id)
    if (!source || !target) return false
    return source.parentId === target.parentId
  }, [connectingFrom, index])
  const linkSource = connectingFrom ? index.get(connectingFrom)?.block : undefined

  // Direct links from the connecting source, to highlight already linked targets.
  const linkedFromSource = useMemo(() => {
    if (!connectingFrom) return new Set<string>()
    return new Set((doc.links ?? []).filter(l => l.from === connectingFrom).map(l => l.to))
  }, [doc.links, connectingFrom])

  function drillIn(block: Block, cardRect: CardRect, report = true) {
    pendingFrom.current = cardRect
    setPath(p => [...p, { id: block.id, cardRect }])
    setHighlight(null)
    setLayoutKey(k => k + 1)
    if (report) onNavigate({ in: block.id })
  }

  function addChildAndDrillIn(block: Block, cardRect: CardRect) {
    actions.add(block.id)
    drillIn(block, cardRect)
  }

  function addTextAndDrillIn(block: Block, cardRect: CardRect) {
    actions.makeText(block.id)
    drillIn(block, cardRect)
  }

  /**
   * Up to the level at `depth` (0 = top). The screen being left shrinks into
   * its card there: the card is measured on that level once it is laid out,
   * so this works after opening by a link too, and after a resize.
   */
  function goBack(depth: number, nextHighlight: string | null = null, report = true) {
    if (depth >= livePath.length || isAnimating.current) return
    const target = livePath.slice(0, depth)
    const slide = slideRef.current
    const host = slide?.parentElement
    if (slide && host) {
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
      pendingGhost.current = { el: ghost, cardId: livePath[depth]!.id }
    }
    setPath(target)
    setHighlight(nextHighlight)
    setLayoutKey(k => k + 1)
    if (report) onNavigate(nextHighlight ? { at: nextHighlight } : viewOfPath(target.map(p => p.id)))
  }

  // The screen as an address, to tell a change from outside from our own
  const ownView: ViewAddress = highlight ? { at: highlight } : viewOfPath(livePath.map(p => p.id))
  const ownViewRef = useRef(ownView)
  ownViewRef.current = ownView

  // A new address from outside (back/forward, a link, the host): go there.
  // One level up or down zooms like a click; anything further jumps.
  useEffect(() => {
    if (sameView(view, ownViewRef.current)) return
    const next = resolveView(doc, view, index)
    const current = livePath.map(p => p.id)
    const isPrefix = (a: string[], b: string[]) => a.length <= b.length && a.every((id, i) => b[i] === id)
    if (next.path.length < current.length && isPrefix(next.path, current) && !isAnimating.current) {
      goBack(next.path.length, next.highlight ?? null, false)
      return
    }
    const child = next.path[current.length]
    const card = child !== undefined && next.path.length === current.length + 1 && isPrefix(current, next.path)
      ? cardElsMap.current.get(child) : undefined
    if (card && !next.highlight) {
      const r = card.getBoundingClientRect()
      drillIn(index.get(child!)!.block, { left: r.left, top: r.top, width: r.width, height: r.height }, false)
      return
    }
    setPath(next.path.map(id => ({ id })))
    setHighlight(next.highlight ?? null)
    setLayoutKey(k => k + 1)
    // Only the address changes: the rest of the state is read through refs and the latest render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function endDrag() {
    setDragId(null)
    setDrop(null)
    setDropCrumb(null)
  }

  // Grid cell under a point, measured from the cells drawn in edit mode, so
  // rows of any height and the fit zoom are taken into account. Outside the
  // grid: the nearest cell.
  const cellAt = useCallback((x: number, y: number): Cell | null => {
    let best: Cell | null = null
    let bestDistance = Infinity
    for (const el of gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]') ?? []) {
      const r = el.getBoundingClientRect()
      const dx = Math.max(r.left - x, 0, x - r.right)
      const dy = Math.max(r.top - y, 0, y - r.bottom)
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        const [col, row] = el.dataset.cell!.split(',').map(Number)
        best = { col: col!, row: row! }
      }
    }
    return best
  }, [])

  const canPlace = useCallback((id: string, area: Area) => isFree(area, othersOf(areas, id)), [areas])

  // While dragging: into the middle of a card with room for a child, or the
  // place under the dragged card's top-left corner.
  function dragOver(e: React.DragEvent) {
    if (!dragId) return
    e.preventDefault()
    const own = areas.get(dragId)
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')
    const cardId = card?.dataset.blockId
    const target = cardId ? index.get(cardId)?.block : undefined
    if (card && target && cardId !== dragId && target.details === undefined && (target.children?.length ?? 0) < MAX_BLOCKS_PER_LEVEL) {
      const r = card.getBoundingClientRect()
      const tx = (e.clientX - r.left) / r.width
      const ty = (e.clientY - r.top) / r.height
      if (tx > 0.25 && tx < 0.75 && ty > 0.25 && ty < 0.75) {
        if (!(drop && 'inside' in drop && drop.inside === target.id)) setDrop({ inside: target.id })
        return
      }
    }
    if (!own) return
    // Aim a little inside the corner, so the cell is the one the corner covers
    const cell = cellAt(e.clientX - dragOffset.current.x + 8, e.clientY - dragOffset.current.y + 8)
    if (!cell) return
    const area = {
      col: Math.min(cell.col, GRID_SIZE - own.width),
      row: Math.min(cell.row, GRID_SIZE - own.height),
      width: own.width,
      height: own.height,
    }
    const same = drop && 'area' in drop && formatArea(drop.area) === formatArea(area)
    if (!same) setDrop({ area, ok: canPlace(dragId, area) })
  }

  function commitDrop() {
    if (dragId && drop && 'inside' in drop) {
      actions.move(dragId, drop.inside)
    } else if (dragId && drop && 'area' in drop && drop.ok) {
      const at = formatArea(drop.area)
      if (at !== blocks.find(b => b.id === dragId)?.at) actions.place(dragId, at)
    }
    endDrag()
  }

  // Level shown by breadcrumb i: the top level, then the opened blocks
  const crumbLevel = (i: number): string | null => (i === 0 ? null : livePath[i - 1]!.id)
  const levelHasRoom = (id: string | null) => getLevel(doc, id, index).length < MAX_BLOCKS_PER_LEVEL

  // A breadcrumb takes a dragged block up to that level
  const crumbDrop = (i: number) => editing && i < livePath.length ? {
    onDragOver: (e: React.DragEvent) => {
      if (!dragId || !levelHasRoom(crumbLevel(i))) return
      e.preventDefault()
      setDrop(null)
      if (dropCrumb !== i) setDropCrumb(i)
    },
    onDragLeave: () => setDropCrumb(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragId) actions.move(dragId, crumbLevel(i))
      endDrag()
    },
  } : {}

  // Keyboard moves keep the focus on the moved block's handle
  const focusAfterMove = useRef<string | null>(null)
  function nudge(id: string, dx: number, dy: number, resize: boolean) {
    const area = areas.get(id)
    if (!area) return
    const next = resize
      ? { ...area, width: area.width + dx, height: area.height + dy }
      : { ...area, col: area.col + dx, row: area.row + dy }
    if (!canPlace(id, next)) return
    focusAfterMove.current = id
    actions.place(id, formatArea(next))
  }
  useEffect(() => {
    const id = focusAfterMove.current
    if (!id) return
    focusAfterMove.current = null
    gridRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"] [data-drag-handle]`)?.focus()
  }, [blocks])

  const dropZone = editing ? {
    onDragOver: dragOver,
    onDrop: (e: React.DragEvent) => { e.preventDefault(); commitDrop() },
  } : {}

  function connectTarget(id: string) {
    if (!connectingFrom) return
    actions.toggleLink(connectingFrom, id)
    setConnectingFrom(null)
  }

  const crumbs = [{ label: doc.title }, ...livePath.map(p => ({ label: index.get(p.id)?.block.title ?? '' }))]

  const renderCard = (block: Block) => {
    const area = areas.get(block.id)
    // Only valid documents reach the viewer; a block without a place is skipped
    if (!area) return null
    return <BlockCard
      key={block.id}
      block={block}
      area={area}
      editing={editing}
      onRename={actions.rename}
      onDescribe={actions.describe}
      onOpenShapes={openShapes}
      onDelete={actions.remove}
      onAddChild={addChildAndDrillIn}
      onAddText={addTextAndDrillIn}
      onDrillIn={drillIn}
      highlighted={highlight === block.id}
      onCopyLink={onCopyLink && !editing ? id => onCopyLink({ at: id }) : undefined}
      connectingFrom={connectingFrom}
      canLinkTo={canLinkTo(block.id)}
      isConnected={linkedFromSource.has(block.id)}
      onStartConnect={id => setConnectingFrom(id === connectingFrom ? null : id)}
      onConnectTarget={connectTarget}
      onRegisterEl={registerCard}
      isDragged={dragId === block.id}
      isDropTarget={!!drop && 'inside' in drop && drop.inside === block.id}
      onDragStartBlock={(id, offset) => { dragOffset.current = offset; setDragId(id) }}
      onDragEndBlock={endDrag}
      onNudge={nudge}
      selectable={grouping !== null}
      selected={grouping?.includes(block.id) ?? false}
      onToggleSelect={id => setGrouping(g => g && (g.includes(id) ? g.filter(x => x !== id) : [...g, id]))}
      cellAt={cellAt}
      canPlace={canPlace}
      onPlace={actions.place}
    />
  }

  // Edit mode: the cells of the grid. Free ones add a block where clicked;
  // all of them tell drag and resize which cell is under the pointer.
  const cells = () => {
    const taken = [...areas.values()]
    return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
      const cell = { col: i % GRID_SIZE, row: Math.floor(i / GRID_SIZE) }
      const free = taken.every(t => !overlap(t, { ...cell, width: 1, height: 1 }))
      const name = formatArea({ ...cell, width: 1, height: 1 })
      const area = free && canAdd ? newBlockArea(cell, taken) : undefined
      return area ? (
        <button
          key={name}
          className={`${styles.cell} ${styles.cellFree}`}
          data-cell={`${cell.col},${cell.row}`}
          style={areaStyle({ ...cell, width: 1, height: 1 })}
          tabIndex={-1}
          title={`Add a block at ${name}`}
          aria-label={`Add block at ${name}`}
          onClick={() => actions.add(parentId, formatArea(area))}
        >
          <PlusIcon size={14} />
        </button>
      ) : (
        <div key={name} className={styles.cell} data-cell={`${cell.col},${cell.row}`} style={areaStyle({ ...cell, width: 1, height: 1 })} />
      )
    })
  }

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
              className={`${styles.crumb} ${i === crumbs.length - 1 ? styles.crumbActive : ''} ${dropCrumb === i ? styles.crumbDrop : ''}`}
              onClick={() => goBack(i)}
              disabled={i === crumbs.length - 1}
              aria-current={i === crumbs.length - 1 ? 'location' : undefined}
              {...crumbDrop(i)}
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
            Linking from <strong>{linkSource.title}</strong>: click another block
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
              {head.icon && <BlockIcon icon={head.icon} className={styles.slideIcon} />}
              {/* Editing: the title and description of the document or the opened block, in place */}
              <div className={styles.slideHeaderText}>
                <h1
                  key={`title-${editing}-${parentId}`}
                  className={`${styles.slideTitle} ${editing ? styles.editable : ''}`}
                  contentEditable={editing || undefined}
                  suppressContentEditableWarning
                  onKeyDown={editing ? e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } } : undefined}
                  onBlur={editing ? e => {
                    const text = e.currentTarget.textContent ?? ''
                    if (parent) actions.rename(parent.id, text)
                    else actions.renameDocument(text)
                  } : undefined}
                >
                  {head.title}
                </h1>
                {(head.description || editing) && (
                  <p
                    key={`desc-${editing}-${parentId}`}
                    className={`${styles.slideDescription} ${editing ? styles.editable : ''}`}
                    contentEditable={editing || undefined}
                    suppressContentEditableWarning
                    data-placeholder="Description"
                    onBlur={editing ? e => {
                      const text = e.currentTarget.textContent ?? ''
                      if (parent) actions.describe(parent.id, text)
                      else actions.describeDocument(text)
                    } : undefined}
                  >
                    {head.description}
                  </p>
                )}
              </div>
              {/* On the right, so entering edit mode leaves the grid its size */}
              <div className={styles.headerActions}>
              {onCopyLink && !editing && (
                // Link to this screen (`#in=<id>`, or the top level)
                <button
                  className={styles.linkBtn}
                  onClick={() => onCopyLink(viewOfPath(livePath.map(p => p.id))).then(setScreenCopied, () => setScreenCopied(false))}
                  aria-label="Copy link to this screen"
                  title={screenCopied === true ? 'Link copied' : screenCopied === false ? 'Could not copy the link' : 'Copy link to this screen'}
                >
                  {screenCopied === true ? <CheckIcon /> : <LinkIcon />}
                </button>
              )}
              {editing && textBlock && !textBlock.details?.trim() && (
                // Only while empty: a block with text stays a text block
                <div className={styles.levelTools} role="group" aria-label="Level tools">
                  <button className={styles.groupBtn} onClick={() => actions.toBlocks(textBlock.id)}>
                    <PlusIcon size={11} /> Blocks instead
                  </button>
                </div>
              )}
              {editing && !isText && (
                <div className={styles.levelTools} role="group" aria-label="Level tools">
                  {canAdd && (
                    <button className={styles.groupBtn} onClick={() => actions.add(parentId)} aria-label="Add block">
                      <PlusIcon size={11} /> Add block
                    </button>
                  )}
                  {blocks.length >= 2 && <button
                    className={`${styles.groupBtn} ${grouping ? styles.groupBtnActive : ''}`}
                    onClick={() => {
                      setConnectingFrom(null)
                      setGrouping(g => (g ? null : []))
                    }}
                    aria-pressed={grouping !== null}
                  >
                    Group blocks
                  </button>}
                  {blocks.length >= MAX_BLOCKS_PER_LEVEL && !grouping && (
                    <span className={styles.fullHint}>
                      {blocks.length} of {MAX_BLOCKS_PER_LEVEL}: group blocks to add more
                    </span>
                  )}
                  {layoutIssues.length > 0 && (
                    // The arrows concerned are marked; hover either for the reasons
                    <span className={styles.layoutHint} title={layoutIssues.map(i => i.message).join('\n')}>
                      {layoutIssues.length} layout {layoutIssues.length === 1 ? 'hint' : 'hints'}
                    </span>
                  )}
                </div>
              )}
              </div>
            </div>
          )
        })()}

        <div ref={gridAreaRef} className={`${styles.gridArea} ${isNested ? styles.gridAreaNested : ''} ${isText ? styles.gridAreaText : ''}`}>
          {textBlock ? (
            <TextLevel
              key={textBlock.id}
              block={textBlock}
              editing={editing}
              onChange={text => actions.setDetails(textBlock.id, text)}
            />
          ) : <>
          {/* The level's 6×6 grid: each block covers the cells its "at" names */}
          <div
            ref={gridRef}
            className={`${styles.grid} ${editing ? styles.gridEditing : ''}`}
            style={zoom < 1 ? { ...gridStyle, zoom } : gridStyle}
            {...dropZone}
          >
            {editing && cells()}
            {blocks.map(block => renderCard(block))}
            {drop && 'area' in drop && (
              <div className={`${styles.dropArea} ${drop.ok ? '' : styles.dropAreaBad}`} style={areaStyle(drop.area)} />
            )}
          </div>

          {blocks.length === 0 && !editing && (
            <p className={styles.empty}>Nothing here yet</p>
          )}

          {arrows.length > 0 && (
            <svg className={`${styles.arrowSvg} ${editing ? styles.arrowSvgEditing : ''}`} aria-hidden={editing ? undefined : true}>
              <defs>
                {/* Base of the head at the path end (refX 0): the head continues the line. */}
                <marker id={markerId} {...HEAD_MARKER}>
                  <path d={HEAD_PATH} className={styles.arrowHead} />
                </marker>
                <marker id={warnMarkerId} {...HEAD_MARKER}>
                  <path d={HEAD_PATH} className={styles.arrowHeadWarn} />
                </marker>
              </defs>
              {arrows.map(a => {
                // Editing only: a layout problem, explained on hover
                const warnings = arrowWarnings.get(a.key)
                const head = `url(#${warnings ? warnMarkerId : markerId})`
                return (
                <g key={a.key} data-link={a.key} data-layout-warning={warnings ? true : undefined}>
                  {editing && (
                    // Wide invisible stroke: easy to hit, opens the link editor
                    <path
                      d={a.d}
                      className={styles.arrowHit}
                      role="button"
                      aria-label={`Edit link ${index.get(a.link.from)?.block.title ?? a.link.from} – ${index.get(a.link.to)?.block.title ?? a.link.to}`}
                      aria-description={warnings?.join('. ')}
                      onClick={e => { e.stopPropagation(); setOpenArrow(pairKey(a.link)) }}
                    >
                      {warnings && <title>{warnings.join('\n')}</title>}
                    </path>
                  )}
                  <path
                    d={a.d}
                    className={`${styles.arrow} ${a.link.style === 'solid' ? '' : styles[a.link.style]} ${warnings ? styles.arrowWarn : ''}`}
                    markerEnd={a.link.direction !== 'none' ? head : undefined}
                    markerStart={a.link.direction === 'both' ? head : undefined}
                  />
                </g>
                )
              })}
            </svg>
          )}

          {arrows.some(a => a.label) && (
            // Labels in pills over the lines: HTML, so a pill fits its text
            <div className={`${styles.arrowLabels} ${editing ? styles.arrowLabelsEditing : ''}`} aria-hidden={editing ? undefined : true}>
              {arrows.map(a => {
                if (!a.label) return null
                // Vertical arrows often cross a narrow gap between rows: label beside
                // the arrow. A detour on the left has the cards on its right: label
                // outside it, or on the line itself when the level's edge is too close.
                const room = a.mid.x - LABEL_GAP
                const anchor = !a.vertical ? 'middle'
                  : !a.detourLeft ? 'start'
                  : room >= a.label.length * LABEL_CHAR + LABEL_PAD ? 'end' : 'middle'
                const x = anchor === 'start' ? a.mid.x + LABEL_GAP : anchor === 'end' ? a.mid.x - LABEL_GAP : a.mid.x
                const shift = anchor === 'start' ? '0' : anchor === 'end' ? '-100%' : '-50%'
                return (
                  <span
                    key={a.key}
                    data-link={a.key}
                    className={`${styles.arrowLabel} ${openArrow === pairKey(a.link) ? styles.arrowLabelOpen : ''}`}
                    style={{ left: x, top: a.mid.y, transform: `translate(${shift}, -50%)` }}
                    onClick={editing ? e => { e.stopPropagation(); setOpenArrow(pairKey(a.link)) } : undefined}
                  >
                    {a.label}
                  </span>
                )
              })}
            </div>
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
          {(() => {
            const block = editing && shapeMenu && blocks.find(b => b.id === shapeMenu.id)
            if (!block || !shapeMenu) return null
            return (
              <ShapeMenu
                value={block.shape ?? 'process'}
                x={shapeMenu.x}
                y={shapeMenu.y}
                onPick={shape => actions.setShape(block.id, shape)}
                onClose={closeShapes}
              />
            )
          })()}
          </>}
        </div>
      </div>
    </div>
  )
}
