import { useEffect, useState } from 'react'
import type { Block } from '@takesix/core'
import { CrossIcon } from './icons.js'
import { Markdown } from './markdown.js'
import styles from './DetailsPanel.module.css'

interface Props {
  block: Block
  editing: boolean
  /** Saves the Markdown source; an empty string removes `details`. */
  onChange: (details: string) => void
  onClose: () => void
}

/** Side panel with a block's long description (`details`, Markdown). */
export function DetailsPanel({ block, editing, onChange, onClose }: Props) {
  const [draft, setDraft] = useState(block.details ?? '')
  useEffect(() => setDraft(block.details ?? ''), [block.id, block.details])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Esc in the editor only leaves the field; elsewhere it closes the panel
      if (e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function commit() {
    if (draft !== (block.details ?? '')) onChange(draft)
  }

  return (
    <aside className={styles.panel} aria-label={`Details: ${block.title}`}>
      <button className={styles.close} onClick={onClose} aria-label="Close details">
        <CrossIcon />
      </button>
      <div className={styles.head}>
        {block.icon && <span className={styles.icon}>{block.icon}</span>}
        <div>
          <h2 className={styles.title}>{block.title}</h2>
          {block.description && <p className={styles.description}>{block.description}</p>}
        </div>
      </div>

      {editing ? (
        <>
          <textarea
            className={styles.editor}
            value={draft}
            placeholder={'Details in Markdown: **bold**, *italic*, `code`, lists, [links](https://…)'}
            aria-label="Details (Markdown)"
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
          />
          {draft.trim() && <Markdown source={draft} className={styles.body} />}
        </>
      ) : block.details?.trim() ? (
        <Markdown source={block.details} className={styles.body} />
      ) : (
        <p className={styles.empty}>No details</p>
      )}
    </aside>
  )
}
