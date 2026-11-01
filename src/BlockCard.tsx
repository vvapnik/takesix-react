import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SIZE, SIZES, type Block, type Size } from '@takesix/core'
import { ArrowRightIcon, CrossIcon, DetailsIcon, PlusIcon } from './icons.js'
import styles from './BlockCard.module.css'

export interface CardRect {
  left: number; top: number; width: number; height: number
}

/** Where a dragged block would land relative to this card. */
/** Arrow keys on the drag handle: earlier or later in the flow. */
const MOVE_KEYS: Record<string, -1 | 1> = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }

/** Where a dragged block lands: next to this card, or inside it as its last child. */
export type DropPosition = 'before' | 'inside' | 'after'

/** Grid columns (of 6) each size spans. */
export const SIZE_SPAN: Record<Size, number> = { S: 2, M: 3, L: 4, F: 6 }
const SIZE_LABEL: Record<Size, string> = { S: '⅓', M: '½', L: '⅔', F: '1' }
const SIZE_NAME: Record<Size, string> = { S: 'a third', M: 'half', L: 'two thirds', F: 'full width' }

/** The size whose span is closest to `columns`. */
function sizeForColumns(columns: number): Size {
  return SIZES.reduce((best, s) => (Math.abs(SIZE_SPAN[s] - columns) < Math.abs(SIZE_SPAN[best] - columns) ? s : best))
}

interface Props {
  block: Block
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
  /** Drag and drop to reorder, edit mode only. */
  isDragged: boolean
  dropPosition: DropPosition | null
  /** The dragged block may move into this one (it has room for another child). */
  canDropInside: boolean
  onDragStartBlock: (id: string) => void
  onDragOverBlock: (id: string, position: DropPosition) => void
  onDragEndBlock: () => void
  /** Keyboard reordering from the drag handle: one place earlier (-1) or later (1). */
  onMoveBy: (id: string, delta: -1 | 1) => void
  onShowDetails: (id: string) => void
  /** Choosing blocks to group: a click selects instead of opening. */
  selectable: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  onResize: (id: string, size: Size) => void
}

export function BlockCard({
  block, editing, onRename, onDescribe, onDelete, onAddChild, onDrillIn,
  connectingFrom, canLinkTo, isConnected, onStartConnect, onConnectTarget, onRegisterEl,
  isDragged, dropPosition, canDropInside, onDragStartBlock, onDragOverBlock, onDragEndBlock, onMoveBy, onShowDetails,
  selectable, selected, onToggleSelect, onResize,
}: Props) {
  // While the right edge is being dragged: the size under the pointer
  const [previewSize, setPreviewSize] = useState<Size | null>(null)
  const size = previewSize ?? block.size ?? DEFAULT_SIZE
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
  // Full-width rows are ordered top to bottom, everything else left to right.
  const axis = size === 'F' ? 'y' : 'x'

  const isConnectingSource = connectingFrom === block.id
  const isConnectable = connectingFrom !== null && connectingFrom !== block.id && canLinkTo
  const isUnlinkable = connectingFrom !== null && connectingFrom !== block.id && !canLinkTo

  const onRegisterElRef = useRef(onRegisterEl)
  onRegisterElRef.current = onRegisterEl

  useEffect(() => {
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
  if (size === 'F') cardClass += ` ${styles.cardWide}`
  if (previewSize) cardClass += ` ${styles.cardResizing}`
  if (editing) cardClass += ` ${styles.cardEditing}`
  else if (hasDetails) cardClass += ` ${styles.cardWithDetails}`
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
      data-size={size}
      data-drop={dropPosition ?? undefined}
      data-axis={axis}
      onClick={handleCardClick}
      draggable={editing && armed}
      onDragStart={e => {
        if (!armed) { e.preventDefault(); return }
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', block.id)
        onDragStartBlock(block.id)
      }}
      onDragOver={e => {
        if (!editing) return
        const r = e.currentTarget.getBoundingClientRect()
        // Along the flow: the outer quarters drop next to the card, the middle into it
        const t = axis === 'y' ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width
        onDragOverBlock(block.id, canDropInside && t > 0.25 && t < 0.75 ? 'inside' : t < 0.5 ? 'before' : 'after')
      }}
      onDragEnd={() => { setArmed(false); onDragEndBlock() }}
    >
      {editing && (
        // Right edge: drag to resize, snapping to the four sizes
        <div
          className={styles.resizeHandle}
          data-resize-handle
          title="Drag to resize"
          aria-hidden="true"
          onPointerDown={e => {
            e.preventDefault()
            e.stopPropagation()
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setPreviewSize(block.size ?? DEFAULT_SIZE)
          }}
          onPointerMove={e => {
            if (!previewSize || !cardEl.current) return
            const grid = cardEl.current.parentElement
            if (!grid) return
            const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
            const column = (grid.getBoundingClientRect().width - 5 * gap) / 6
            const columns = (e.clientX - cardEl.current.getBoundingClientRect().left + gap) / (column + gap)
            const next = sizeForColumns(columns)
            if (next !== previewSize) setPreviewSize(next)
          }}
          onPointerUp={() => {
            if (previewSize && previewSize !== (block.size ?? DEFAULT_SIZE)) onResize(block.id, previewSize)
            setPreviewSize(null)
          }}
          onPointerCancel={() => setPreviewSize(null)}
        />
      )}

      {editing && (
        <div
          className={styles.dragHandle}
          data-drag-handle
          role="button"
          tabIndex={0}
          aria-label={`Move ${block.title}`}
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
          title="Drag to reorder, or focus and use the arrow keys"
          onPointerDown={() => setArmed(true)}
          onKeyDown={e => {
            const delta = MOVE_KEYS[e.key]
            if (!delta) return
            e.preventDefault()
            onMoveBy(block.id, delta)
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

      {(editing || hasDetails) && (
        // Viewing: only when there are details. Editing: always, to add them.
        <button
          className={`${styles.detailsBtn} ${hasDetails ? styles.detailsBtnFilled : ''}`}
          onClick={e => { e.stopPropagation(); onShowDetails(block.id) }}
          aria-label={`Details of ${block.title}`}
          title={hasDetails ? 'Details' : 'Add details'}
        >
          <DetailsIcon />
        </button>
      )}

      {editing && (
        <button
          className={styles.sizeBtn}
          onClick={e => {
            e.stopPropagation()
            onResize(block.id, SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]!)
          }}
          aria-label={`Size of ${block.title}: ${SIZE_NAME[size]}`}
          title="Size: click to change, or drag the right edge"
        >
          {SIZE_LABEL[size]}
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
    </div>
  )
}
