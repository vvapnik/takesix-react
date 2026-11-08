import { useEffect, useState } from 'react'
import type { Block } from '@takesix/core'
import { Markdown } from './markdown.js'
import styles from './TextLevel.module.css'

interface Props {
  block: Block
  editing: boolean
  /** Saves the Markdown source. An empty text keeps the block a text block. */
  onChange: (details: string) => void
}

/**
 * The screen of a block that opens into text (`details`) instead of child
 * blocks: the Markdown in a column of reading width (~70 characters), under
 * the same header as any level. Editing: the source and a preview below it.
 */
export function TextLevel({ block, editing, onChange }: Props) {
  const source = block.details ?? ''
  const [draft, setDraft] = useState(source)
  useEffect(() => setDraft(source), [block.id, source])

  return (
    <div className={styles.scroll} data-text-level>
      <div className={styles.column}>
        {editing ? (
          <>
            <textarea
              className={styles.editor}
              value={draft}
              placeholder={'Text in Markdown: **bold**, *italic*, `code`, lists, [links](https://…)'}
              aria-label={`Text of ${block.title} (Markdown)`}
              onChange={e => setDraft(e.target.value)}
              onBlur={() => { if (draft !== source) onChange(draft) }}
            />
            {draft.trim() && <Markdown source={draft} className={`${styles.body} ${styles.preview}`} />}
          </>
        ) : source.trim() ? (
          <Markdown source={source} className={styles.body} />
        ) : (
          <p className={styles.empty}>No text yet</p>
        )}
      </div>
    </div>
  )
}
