import { useEffect, useRef } from 'react'
import { MAX_BLOCKS_PER_LEVEL, type Block, type Layout } from '@takesix/core'
import { ArrowRightIcon, CrossIcon, PlusIcon } from './icons.js'
import styles from './BlockCard.module.css'

export interface CardRect {
  left: number; top: number; width: number; height: number
}

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
  isConnected: boolean
  onStartConnect: (id: string) => void
  onConnectTarget: (id: string) => void
  onRegisterEl: (id: string, el: HTMLDivElement | null) => void
}

export function BlockCard({
  block, layout, editing, onRename, onDescribe, onDelete, onAddChild, onDrillIn,
  connectingFrom, isConnected, onStartConnect, onConnectTarget, onRegisterEl,
}: Props) {
  const children = (block.children ?? []).slice(0, MAX_BLOCKS_PER_LEVEL)
  const hasChildren = children.length > 0
  const cardEl = useRef<HTMLDivElement>(null)

  const isConnectingSource = connectingFrom === block.id
  const isConnectable = connectingFrom !== null && connectingFrom !== block.id

  const onRegisterElRef = useRef(onRegisterEl)
  onRegisterElRef.current = onRegisterEl

  useEffect(() => {
    onRegisterElRef.current(block.id, cardEl.current)
    return () => { onRegisterElRef.current(block.id, null) }
  }, [block.id])

  function stopPropIfEdit(e: React.MouseEvent) {
    if (editing) e.stopPropagation()
  }

  function getCardRect(): CardRect {
    const r = cardEl.current!.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  let cardClass = styles.card
  if (layout === 'list') cardClass += ` ${styles.cardList}`
  if (isConnectingSource) cardClass += ` ${styles.cardConnectingSource}`
  else if (isConnectable && isConnected) cardClass += ` ${styles.cardConnected}`
  else if (isConnectable) cardClass += ` ${styles.cardConnectable}`

  return (
    <div className={cardClass} ref={cardEl} data-block-id={block.id}>
      {/* Transparent overlay that captures clicks when this card is a connection target */}
      {isConnectable && (
        <button
          className={`${styles.connectOverlay} ${isConnected ? styles.connectOverlayConnected : ''}`}
          onClick={e => { e.stopPropagation(); onConnectTarget(block.id) }}
          aria-label={isConnected ? `Disconnect from ${block.title}` : `Connect to ${block.title}`}
        />
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
            contentEditable={editing || undefined}
            suppressContentEditableWarning
            onClick={stopPropIfEdit}
            onKeyDown={editing ? e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } } : undefined}
            onBlur={editing ? e => onRename(block.id, e.currentTarget.textContent ?? '') : undefined}
          >
            {block.title}
          </h2>
          {(block.description || editing) && (
            <p
              key={`desc-${editing}`}
              className={`${styles.description} ${editing ? styles.editable : ''}`}
              contentEditable={editing || undefined}
              suppressContentEditableWarning
              data-placeholder="Description"
              onClick={stopPropIfEdit}
              onBlur={editing ? e => onDescribe(block.id, e.currentTarget.textContent ?? '') : undefined}
            >
              {block.description}
            </p>
          )}
        </div>
      </div>

      {hasChildren && (
        <button
          className={styles.childrenSection}
          aria-label={`Zoom into ${block.title}`}
          onClick={() => {
            if (!cardEl.current) return
            onDrillIn(block, getCardRect())
          }}
        >
          <div className={styles.miniGrid} data-count={children.length} data-layout={block.layout ?? 'tiles'}>
            {children.map(child => (
              <div key={child.id} className={styles.miniCard}>
                {child.icon && <span className={styles.miniIcon}>{child.icon}</span>}
                <div className={styles.miniText}>
                  <span className={styles.miniTitle}>{child.title}</span>
                </div>
              </div>
            ))}
          </div>
        </button>
      )}

      {!hasChildren && editing && (
        <button
          className={styles.addChildBtn}
          onClick={e => {
            e.stopPropagation()
            if (!cardEl.current) return
            onAddChild(block, getCardRect())
          }}
          aria-label={`Add child to ${block.title}`}
        >
          <PlusIcon size={16} />
        </button>
      )}
    </div>
  )
}
