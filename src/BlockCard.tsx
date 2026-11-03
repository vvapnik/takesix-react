import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatArea, type Area, type Block } from '@takesix/core'
import { ArrowRightIcon, CrossIcon, DetailsIcon, PlusIcon } from './icons.js'
import styles from './BlockCard.module.css'

export interface CardRect {
  left: number; top: number; width: number; height: number
}

/** Arrow keys on the drag handle: one cell in that direction. */
const MOVE_KEYS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0] }

/** Cell of the level's grid, zero-based. */
export interface Cell {
  col: number
  row: number
}

/** CSS grid placement of an area. */
export const areaStyle = ({ col, row, width, height }: Area) => ({
  gridColumn: `${col + 1} / span ${width}`,
  gridRow: `${row + 1} / span ${height}`,
})

interface Props {
  block: Block
  /** Place on the level's grid. */
  area: Area
  editing: boolean
  onRename: (id: string, title: string) => void
  onDescribe: (id: string, description: string) => void
  onDelete: (id: string) => void
  onAddChild: (block: Block, cardRect: CardRect) => void
  onDrillIn: (block: Block, cardRect: CardRect) => void
  connectingFrom: string | null
  /** While linking: this block may be the target (not the source, its ancestor or descendant). */
  canLinkTo: boolean
  isConnected: boolean
  onStartConnect: (id: string) => void
  onConnectTarget: (id: string) => void
  onRegisterEl: (id: string, el: HTMLDivElement | null) => void
  /** Drag and drop to another place, edit mode only. */
  isDragged: boolean
  /** The dragged block would move into this one. */
  isDropTarget: boolean
  /** `offset`: where the card was grabbed, from its top-left corner. */
  onDragStartBlock: (id: string, offset: { x: number; y: number }) => void
  onDragEndBlock: () => void
  /** Arrow keys on the drag handle: move by a cell, or with Shift grow or shrink the block. */
  onNudge: (id: string, dx: number, dy: number, resize: boolean) => void
  /** Opens the details popup next to `anchor` (the control that was clicked). */
  onShowDetails: (id: string, anchor: DOMRect) => void
  /** Choosing blocks to group: a click selects instead of opening. */
  selectable: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  /** Grid cell under a point on screen (the nearest one outside the grid). */
  cellAt: (x: number, y: number) => Cell | null
  /** Whether this block may take `area` (inside the grid, no other block there). */
  canPlace: (id: string, area: Area) => boolean
  onPlace: (id: string, at: string) => void
}

export function BlockCard({
  block, editing, onRename, onDescribe, onDelete, onAddChild, onDrillIn,
  connectingFrom, canLinkTo, isConnected, onStartConnect, onConnectTarget, onRegisterEl,
  area: placedArea, isDragged, isDropTarget, onDragStartBlock, onDragEndBlock, onNudge, onShowDetails,
  selectable, selected, onToggleSelect, cellAt, canPlace, onPlace,
}: Props) {
  // While the corner is being dragged: the area under the pointer
  const [preview, setPreview] = useState<Area | null>(null)
  const area = preview ?? placedArea
  const previewOk = !preview || canPlace(block.id, preview)
  const hasDetails = !!block.details?.trim()
  // Direct children only: the counter tells what the next screen holds.
  const childCount = block.children?.length ?? 0
  const hasChildren = childCount > 0
  const cardEl = useRef<HTMLDivElement>(null)

  // The card is draggable only while the handle is held, so text can still be
  // selected and edited by dragging inside the card.
  const [armed, setArmed] = useState(false)
  // Released without dragging (anywhere on the page): disarm.
  useEffect(() => {
    if (!armed) return
    const disarm = () => setArmed(false)
    window.addEventListener('pointerup', disarm)
    return () => window.removeEventListener('pointerup', disarm)
  }, [armed])

  const isConnectingSource = connectingFrom === block.id
  const isConnectable = connectingFrom !== null && connectingFrom !== block.id && canLinkTo
  const isUnlinkable = connectingFrom !== null && connectingFrom !== block.id && !canLinkTo

  const onRegisterElRef = useRef(onRegisterEl)
  onRegisterElRef.current = onRegisterEl

  // A layout effect: registered before the viewer routes arrows for the first paint
  useLayoutEffect(() => {
    onRegisterElRef.current(block.id, cardEl.current)
    return () => { onRegisterElRef.current(block.id, null) }
  }, [block.id])

  function getCardRect(): CardRect {
    const r = cardEl.current!.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  // A click anywhere on a card with children opens it, text included, except
  // on its handles and, while editing, on the text being edited. A finished
  // text selection does not open it, so text can still be copied.
  function handleCardClick(e: React.MouseEvent) {
    if (!hasChildren || !cardEl.current) return
    const keep = editing ? '[data-text], [data-drag-handle], [data-resize-handle]' : '[data-drag-handle], [data-resize-handle]'
    if ((e.target as HTMLElement).closest(keep)) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && cardEl.current.contains(selection.anchorNode)) return
    onDrillIn(block, getCardRect())
  }

  let cardClass = styles.card
  if (hasChildren && !isConnectable && !selectable) cardClass += ` ${styles.cardZoomable}`
  if (selected) cardClass += ` ${styles.cardSelected}`
  // A full-width single row reads like a list item
  if (area.width === 6 && area.height === 1) cardClass += ` ${styles.cardWide}`
  if (preview) cardClass += ` ${previewOk ? styles.cardResizing : styles.cardResizingBad}`
  if (editing) cardClass += ` ${styles.cardEditing}`
  if (isDragged) cardClass += ` ${styles.cardDragged}`
  if (isConnectingSource) cardClass += ` ${styles.cardConnectingSource}`
  else if (isConnectable && isConnected) cardClass += ` ${styles.cardConnected}`
  else if (isConnectable) cardClass += ` ${styles.cardConnectable}`
  else if (isUnlinkable) cardClass += ` ${styles.cardUnlinkable}`

  return (
    <div
      className={cardClass}
      ref={cardEl}
      data-block-id={block.id}
      data-at={formatArea(area)}
      // Phone width hides the description of blocks half the grid wide or narrower
      data-compact={area.width <= 3 || undefined}
      data-drop={isDropTarget ? 'inside' : undefined}
      style={areaStyle(area)}
      onClick={handleCardClick}
      draggable={editing && armed}
      onDragStart={e => {
        if (!armed) { e.preventDefault(); return }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', block.id)
        const r = e.currentTarget.getBoundingClientRect()
        onDragStartBlock(block.id, { x: e.clientX - r.left, y: e.clientY - r.top })
      }}
      onDragEnd={() => { setArmed(false); onDragEndBlock() }}
    >
      {editing && (
        // Bottom-right corner: drag to resize, snapping to the grid cells
        <div
          className={styles.resizeHandle}
          data-resize-handle
          title="Drag to resize"
          aria-hidden="true"
          onPointerDown={e => {
            e.preventDefault()
            e.stopPropagation()
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setPreview(placedArea)
          }}
          onPointerMove={e => {
            if (!preview) return
            const cell = cellAt(e.clientX, e.clientY)
            if (!cell) return
            const width = Math.max(1, cell.col - placedArea.col + 1)
            const height = Math.max(1, cell.row - placedArea.row + 1)
            if (width !== preview.width || height !== preview.height) setPreview({ ...placedArea, width, height })
          }}
          onPointerUp={() => {
            if (preview && previewOk && (preview.width !== placedArea.width || preview.height !== placedArea.height)) {
              onPlace(block.id, formatArea(preview))
            }
            setPreview(null)
          }}
          onPointerCancel={() => setPreview(null)}
        />
      )}

      {editing && (
        <div
          className={styles.dragHandle}
          data-drag-handle
          role="button"
          tabIndex={0}
          aria-label={`Move ${block.title}`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowRight Shift+ArrowDown"
          title="Drag to move, or focus and use the arrow keys (with Shift to resize)"
          onPointerDown={() => setArmed(true)}
          onKeyDown={e => {
            const delta = MOVE_KEYS[e.key]
            if (!delta) return
            e.preventDefault()
            onNudge(block.id, delta[0], delta[1], e.shiftKey)
          }}
        />
      )}


      {/* Transparent overlay that captures clicks when this card is a connection target */}
      {selectable && (
        <button
          className={`${styles.connectOverlay} ${styles.selectOverlay}`}
          onClick={e => { e.stopPropagation(); onToggleSelect(block.id) }}
          aria-label={`Select ${block.title}`}
          aria-pressed={selected}
        >
          <span className={styles.selectMark} aria-hidden="true">{selected ? '✓' : ''}</span>
        </button>
      )}

      {isConnectable && (
        <button
          className={`${styles.connectOverlay} ${isConnected ? styles.connectOverlayConnected : ''}`}
          onClick={e => { e.stopPropagation(); onConnectTarget(block.id) }}
          aria-label={isConnected ? `Disconnect from ${block.title}` : `Connect to ${block.title}`}
        />
      )}

      {editing && (
        // Editing: always, to add details. Viewing: the "Details" link below.
        <button
          className={`${styles.detailsBtn} ${hasDetails ? styles.detailsBtnFilled : ''}`}
          onClick={e => { e.stopPropagation(); onShowDetails(block.id, e.currentTarget.getBoundingClientRect()) }}
          aria-label={`Details of ${block.title}`}
          title={hasDetails ? 'Details' : 'Add details'}
        >
          <DetailsIcon />
        </button>
      )}

      {editing && (
        <button
          className={styles.deleteBtn}
          onClick={e => { e.stopPropagation(); onDelete(block.id) }}
          aria-label={`Delete ${block.title}`}
        >
          <CrossIcon />
        </button>
      )}

      {editing && (
        <button
          className={`${styles.connectBtn} ${isConnectingSource ? styles.connectBtnActive : ''}`}
          onClick={e => { e.stopPropagation(); onStartConnect(block.id) }}
          aria-label={isConnectingSource ? 'Cancel connection' : `Connect from ${block.title}`}
          title={isConnectingSource ? 'Cancel' : 'Connect to another block'}
        >
          <ArrowRightIcon />
        </button>
      )}

      <div className={styles.header}>
        {block.icon && <span className={styles.icon}>{block.icon}</span>}
        <div className={styles.headerText}>
          <h2
            key={`title-${editing}`}
            className={`${styles.title} ${editing ? styles.editable : ''}`}
            data-text
            contentEditable={editing || undefined}
            suppressContentEditableWarning
            onKeyDown={editing ? e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } } : undefined}
            onBlur={editing ? e => onRename(block.id, e.currentTarget.textContent ?? '') : undefined}
          >
            {block.title}
          </h2>
          {(block.description || editing) && (
            <p
              key={`desc-${editing}`}
              className={`${styles.description} ${editing ? styles.editable : ''}`}
              data-text
              contentEditable={editing || undefined}
              suppressContentEditableWarning
              data-placeholder="Description"
              onBlur={editing ? e => onDescribe(block.id, e.currentTarget.textContent ?? '') : undefined}
            >
              {block.description}
            </p>
          )}
        </div>
      </div>

      {/* Bottom line: what is inside on the left, the details on the right */}
      <div className={styles.footer}>
        {hasChildren && (
          // No handler of its own: the click bubbles to the card. The button keeps
          // the zoom reachable from the keyboard.
          <button className={styles.inside} aria-label={`Zoom into ${block.title}`}>
            {childCount} more inside
          </button>
        )}

        {!hasChildren && editing && (
          // Same place and look as "N more inside": a quiet line, not a box
          <button
            className={`${styles.inside} ${styles.addInside}`}
            onClick={e => {
              e.stopPropagation()
              if (!cardEl.current) return
              onAddChild(block, getCardRect())
            }}
            aria-label={`Add child to ${block.title}`}
          >
            <PlusIcon size={11} /> add inside
          </button>
        )}

        {hasDetails && !editing && (
          <button
            className={styles.detailsLink}
            onClick={e => { e.stopPropagation(); onShowDetails(block.id, e.currentTarget.getBoundingClientRect()) }}
            aria-label={`Details of ${block.title}`}
          >
            Details
          </button>
        )}
      </div>
    </div>
  )
}
