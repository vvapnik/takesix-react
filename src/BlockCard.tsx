import { useEffect, useRef, useState } from 'react'
import type { Block, Layout } from '@takesix/core'
import { ArrowRightIcon, CrossIcon, DetailsIcon, PlusIcon } from './icons.js'
import styles from './BlockCard.module.css'

export interface CardRect {
  left: number; top: number; width: number; height: number
}

/** Where a dragged block would land relative to this card. */
export type DropPosition = 'before' | 'after'

interface Props {
  block: Block
  layout: Layout
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
  onDragStartBlock: (id: string) => void
  onDragOverBlock: (id: string, position: DropPosition) => void
  onDragEndBlock: () => void
  onShowDetails: (id: string) => void
  /** Choosing blocks to group: a click selects instead of opening. */
  selectable: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
}

export function BlockCard({
  block, layout, editing, onRename, onDescribe, onDelete, onAddChild, onDrillIn,
  connectingFrom, canLinkTo, isConnected, onStartConnect, onConnectTarget, onRegisterEl,
  isDragged, dropPosition, onDragStartBlock, onDragOverBlock, onDragEndBlock, onShowDetails,
  selectable, selected, onToggleSelect,
}: Props) {
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
  // Rows are ordered top to bottom, tiles left to right.
  const axis = layout === 'list' ? 'y' : 'x'

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

  // A click anywhere on a card with children opens it, except on text (so it
  // can be selected or edited) and on the card's own buttons.
  function handleCardClick(e: React.MouseEvent) {
    if (!hasChildren || !cardEl.current) return
    if ((e.target as HTMLElement).closest('[data-text], [data-drag-handle]')) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && cardEl.current.contains(selection.anchorNode)) return
    onDrillIn(block, getCardRect())
  }

  let cardClass = styles.card
  if (hasChildren && !isConnectable && !selectable) cardClass += ` ${styles.cardZoomable}`
  if (selected) cardClass += ` ${styles.cardSelected}`
  if (layout === 'list') cardClass += ` ${styles.cardList}`
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
        const middle = axis === 'y' ? r.top + r.height / 2 : r.left + r.width / 2
        onDragOverBlock(block.id, (axis === 'y' ? e.clientY : e.clientX) < middle ? 'before' : 'after')
      }}
      onDragEnd={() => { setArmed(false); onDragEndBlock() }}
    >
      {editing && (
        <div
          className={styles.dragHandle}
          data-drag-handle
          title="Drag to reorder"
          aria-hidden="true"
          onPointerDown={() => setArmed(true)}
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
