import { useEffect, useState } from 'react'
import { MAX_BLOCKS_PER_LEVEL, type Block, type LayoutIssue } from '@takesix/core'
import { BlockIcon, CheckIcon, LinkIcon, PlusIcon } from '../../Icons/index.js'
import type { ViewerActions } from '../actions.js'
import styles from '../Viewer.module.css'

interface Props {
  /** The opened block; on the top level, the document. */
  head: { title: string; description?: string; icon?: string }
  /** The opened block, when below the top level. */
  parent: Block | undefined
  editing: boolean
  actions: ViewerActions
  /** Copies a link to this screen; without it, no link button. */
  onCopyLink?: () => Promise<boolean>
  /** Editing a text level that is still empty: it may hold blocks instead. */
  emptyText: Block | undefined
  /** Editing a level of blocks: its tools are shown. */
  blockTools: boolean
  canAdd: boolean
  blockCount: number
  grouping: boolean
  onToggleGrouping: () => void
  layoutIssues: LayoutIssue[]
}

/**
 * Header of the screen: the document on the top level, the opened block below
 * it. Editing, its title and description are edited in place; on the right,
 * the link button or the level's tools.
 */
export function LevelHeader({
  head, parent, editing, actions, onCopyLink, emptyText, blockTools, canAdd, blockCount, grouping, onToggleGrouping, layoutIssues,
}: Props) {
  const parentId = parent?.id ?? null
  // Link button feedback: copied, failed, or nothing yet
  const [copied, setCopied] = useState<boolean | null>(null)
  useEffect(() => {
    if (copied === null) return
    const timer = setTimeout(() => setCopied(null), 1500)
    return () => clearTimeout(timer)
  }, [copied])

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
            onClick={() => onCopyLink().then(setCopied, () => setCopied(false))}
            aria-label="Copy link to this screen"
            title={copied === true ? 'Link copied' : copied === false ? 'Could not copy the link' : 'Copy link to this screen'}
          >
            {copied === true ? <CheckIcon /> : <LinkIcon />}
          </button>
        )}
        {editing && emptyText && (
          // Only while empty: a block with text stays a text block
          <div className={styles.levelTools} role="group" aria-label="Level tools">
            <button className={styles.groupBtn} onClick={() => actions.toBlocks(emptyText.id)}>
              <PlusIcon size={11} /> Blocks instead
            </button>
          </div>
        )}
        {editing && blockTools && (
          <div className={styles.levelTools} role="group" aria-label="Level tools">
            {canAdd && (
              <button className={styles.groupBtn} onClick={() => actions.add(parentId)} aria-label="Add block">
                <PlusIcon size={11} /> Add block
              </button>
            )}
            {blockCount >= 2 && <button
              className={`${styles.groupBtn} ${grouping ? styles.groupBtnActive : ''}`}
              onClick={onToggleGrouping}
              aria-pressed={grouping}
            >
              Group blocks
            </button>}
            {blockCount >= MAX_BLOCKS_PER_LEVEL && !grouping && (
              <span className={styles.fullHint}>
                {blockCount} of {MAX_BLOCKS_PER_LEVEL}: group blocks to add more
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
}
