import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_BLOCKS_PER_LEVEL,
  buildIndex,
  findPlace,
  formatArea,
  getLevel,
  levelAreas,
  levelLayoutIssues,
  readingOrder,
  resolveView,
  sameView,
  viewOfPath,
  visibleLinks,
  type Block,
  type TakeSixDocument,
  type ViewAddress,
} from '@takesix/core'
import { BlockCard, areaStyle, type CardRect } from '../BlockCard/index.js'
import { LinkPopover } from '../LinkPopover/index.js'
import { ShapeMenu } from '../ShapeMenu/index.js'
import { TextLevel } from '../TextLevel/index.js'
import type { ViewerActions } from './actions.js'
import { ArrowLayer } from './components/ArrowLayer.js'
import { pairKey, toArrows } from './arrows.js'
import { Breadcrumb } from './components/Breadcrumb.js'
import { GridCells } from './components/GridCells.js'
import { gridStyle as gridStyleOf } from './layout.js'
import { LevelHeader } from './components/LevelHeader.js'
import { StatusBar, StatusButton } from './components/StatusBar.js'
import { useArrowPaths } from './hooks/useArrowPaths.js'
import { useCards } from './hooks/useCards.js'
import { useDragAndDrop } from './hooks/useDragAndDrop.js'
import { useFitZoom } from './hooks/useFitZoom.js'
import { useZoomAnimation } from './hooks/useZoomAnimation.js'
import styles from './Viewer.module.css'

export type { ViewerActions } from './actions.js'

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

export function Viewer({ document: doc, editing, actions, typographyTick, view, onNavigate, onCopyLink }: Props) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const gridAreaRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const [connectingFrom, setConnectingFrom] = useState<string | null>(null)
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
  // Opened by a link: straight to that screen, no zoom from the top
  const [initial] = useState(() => resolveView(doc, view))
  const [path, setPath] = useState<PathEntry[]>(() => initial.path.map(id => ({ id })))
  // The block an `at` address points at, outlined until the reader moves on
  const [highlight, setHighlight] = useState<string | null>(initial.highlight ?? null)
  // Changes with each new level: the zoom animation and measuring run again
  const [layoutKey, setLayoutKey] = useState(0)
  // Below 1 when the level is taller than the screen (see useFitZoom)
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
  const pathIds = livePath.map(p => p.id)

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
  const gridStyle = gridStyleOf(areas, editing)

  // Layout effects in this order: the zoom animation, then arrows, then the fit zoom
  const { cardEls, registerCard, sizeTick } = useCards(gridAreaRef)
  const { zoomIn, zoomOut, isAnimating, settleTick } = useZoomAnimation(slideRef, cardEls, layoutKey)
  const arrowPaths = useArrowPaths(slideRef, gridAreaRef, cardEls, blocks, links,
    [layoutKey, editing, sizeTick, settleTick, zoom, typographyTick])
  useFitZoom(viewerRef, gridRef, gridAreaRef, cardEls, blocks, editing, typographyTick, zoom, setZoom,
    [sizeTick, settleTick, layoutKey])
  const arrows = useMemo(() => toArrows(arrowPaths, links), [arrowPaths, links])

  const drag = useDragAndDrop({ doc, index, editing, actions, gridRef, blocks, areas, path: pathIds })

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
    zoomIn(cardRect)
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

  /** Up to the level at `depth` (0 = top); the screen being left shrinks into its card there. */
  function goBack(depth: number, nextHighlight: string | null = null, report = true) {
    if (depth >= livePath.length || isAnimating.current) return
    const target = livePath.slice(0, depth)
    zoomOut(livePath[depth]!.id)
    setPath(target)
    setHighlight(nextHighlight)
    setLayoutKey(k => k + 1)
    if (report) onNavigate(nextHighlight ? { at: nextHighlight } : viewOfPath(target.map(p => p.id)))
  }

  const goUp = () => { if (!isAnimating.current) goBack(livePath.length - 1) }

  // The screen as an address, to tell a change from outside from our own
  const ownView: ViewAddress = highlight ? { at: highlight } : viewOfPath(pathIds)
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
      ? cardEls.current.get(child) : undefined
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

  // Keyboard moves keep the focus on the moved block's handle
  const focusAfterMove = useRef<string | null>(null)
  function nudge(id: string, dx: number, dy: number, resize: boolean) {
    const area = areas.get(id)
    if (!area) return
    const next = resize
      ? { ...area, width: area.width + dx, height: area.height + dy }
      : { ...area, col: area.col + dx, row: area.row + dy }
    if (!drag.canPlace(id, next)) return
    focusAfterMove.current = id
    actions.place(id, formatArea(next))
  }
  useEffect(() => {
    const id = focusAfterMove.current
    if (!id) return
    focusAfterMove.current = null
    gridRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"] [data-drag-handle]`)?.focus()
  }, [blocks])

  function connectTarget(id: string) {
    if (!connectingFrom) return
    actions.toggleLink(connectingFrom, id)
    setConnectingFrom(null)
  }

  const titleOf = (id: string) => index.get(id)?.block.title ?? id
  const crumbs = [doc.title, ...livePath.map(p => index.get(p.id)?.block.title ?? '')]

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
      isDragged={drag.dragId === block.id}
      isDropTarget={!!drag.drop && 'inside' in drag.drop && drag.drop.inside === block.id}
      onDragStartBlock={drag.startDrag}
      onDragEndBlock={drag.endDrag}
      onNudge={nudge}
      selectable={grouping !== null}
      selected={grouping?.includes(block.id) ?? false}
      onToggleSelect={id => setGrouping(g => g && (g.includes(id) ? g.filter(x => x !== id) : [...g, id]))}
      cellAt={drag.cellAt}
      canPlace={drag.canPlace}
      onPlace={actions.place}
    />
  }

  const openLink = editing && arrows.find(a => pairKey(a.link) === openArrow)
  const shapeBlock = editing && shapeMenu && blocks.find(b => b.id === shapeMenu.id)
  const drop = drag.drop

  return (
    <div ref={viewerRef} className={styles.viewer}>
      {isNested && (
        <Breadcrumb labels={crumbs} dropCrumb={drag.dropCrumb} onGoTo={i => goBack(i)} onUp={goUp} crumbDrop={drag.crumbDrop} />
      )}

      {grouping && (
        <StatusBar actions={<>
          <StatusButton disabled={grouping.length < 2} onClick={() => { actions.group(grouping); setGrouping(null) }}>Group</StatusButton>
          <StatusButton onClick={() => setGrouping(null)}>Cancel</StatusButton>
        </>}>
          Select blocks to group: <strong>{grouping.length}</strong> selected
        </StatusBar>
      )}

      {linkSource && (
        <StatusBar actions={<StatusButton onClick={() => setConnectingFrom(null)}>Cancel</StatusButton>}>
          Linking from <strong>{linkSource.title}</strong>: click another block
        </StatusBar>
      )}

      {isNested && <div className={styles.backdrop} onClick={goUp} aria-hidden="true" />}

      {/* slide stays mounted — the zoom animation transforms this element */}
      <div ref={slideRef} className={`${styles.slide} ${isNested ? styles.slideCard : ''}`}>
        <LevelHeader
          head={parent ?? { title: doc.title, description: doc.description }}
          parent={parent}
          editing={editing}
          actions={actions}
          onCopyLink={onCopyLink && (() => onCopyLink(viewOfPath(pathIds)))}
          emptyText={textBlock && !textBlock.details?.trim() ? textBlock : undefined}
          blockTools={!isText}
          canAdd={canAdd}
          blockCount={blocks.length}
          grouping={grouping !== null}
          onToggleGrouping={() => {
            setConnectingFrom(null)
            setGrouping(g => (g ? null : []))
          }}
          layoutIssues={layoutIssues}
        />

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
              {...drag.dropZone}
            >
              {editing && <GridCells taken={[...areas.values()]} canAdd={canAdd} onAdd={at => actions.add(parentId, at)} />}
              {blocks.map(renderCard)}
              {drop && 'area' in drop && (
                <div className={`${styles.dropArea} ${drop.ok ? '' : styles.dropAreaBad}`} style={areaStyle(drop.area)} />
              )}
            </div>

            {blocks.length === 0 && !editing && <p className={styles.empty}>Nothing here yet</p>}

            <ArrowLayer
              arrows={arrows}
              editing={editing}
              warnings={arrowWarnings}
              openArrow={openArrow}
              onOpen={setOpenArrow}
              titleOf={titleOf}
            />

            {openLink && (
              <LinkPopover
                links={openLink.link.links}
                x={openLink.mid.x}
                y={openLink.mid.y}
                titleOf={titleOf}
                onUpdate={actions.updateLink}
                onRemove={actions.removeLink}
                onClose={closeArrow}
              />
            )}
            {shapeBlock && shapeMenu && (
              <ShapeMenu
                value={shapeBlock.shape ?? 'process'}
                x={shapeMenu.x}
                y={shapeMenu.y}
                onPick={shape => actions.setShape(shapeBlock.id, shape)}
                tone={shapeBlock.tone}
                onPickTone={tone => actions.setTone(shapeBlock.id, tone)}
                onClose={closeShapes}
              />
            )}
          </>}
        </div>
      </div>
    </div>
  )
}
