import { useMemo, useState } from 'react'
import {
  addBlock,
  addLink,
  canAddBlock,
  removeBlock,
  updateBlock,
  type TakeSixDocument,
} from '@takesix/core'
import { CheckIcon, PencilIcon } from './icons.js'
import { Viewer, type ViewerActions } from './Viewer.js'
import styles from './TakeSix.module.css'

export interface TakeSixProps {
  /** The diagram to show. Expected to be valid: run `parseDocument` from `@takesix/core` on untrusted input. */
  document: TakeSixDocument
  /** Called with the edited document. Without it the diagram is read-only and the Edit button is hidden. */
  onChange?: (document: TakeSixDocument) => void
  /** Start in edit mode. */
  defaultEditing?: boolean
  className?: string
}

const NEW_BLOCK = { title: 'New block', description: 'Description' }

/** Viewer and editor for a takesix document: one level on screen, click a block to open it. */
export function TakeSix({ document: doc, onChange, defaultEditing = false, className }: TakeSixProps) {
  const editable = onChange !== undefined
  const [editingState, setEditing] = useState(defaultEditing)
  const editing = editable && editingState

  const actions = useMemo<ViewerActions>(() => {
    const commit = (next: TakeSixDocument) => { if (next !== doc) onChange?.(next) }
    return {
      rename(id, title) {
        const trimmed = title.trim()
        // An empty title is invalid in the format: keep the old one.
        if (trimmed) commit(updateBlock(doc, id, { title: trimmed }))
      },
      describe(id, description) {
        commit(updateBlock(doc, id, { description: description.trim() || undefined }))
      },
      remove(id) {
        commit(removeBlock(doc, id))
      },
      add(parentId) {
        if (canAddBlock(doc, parentId)) commit(addBlock(doc, parentId, NEW_BLOCK).document)
      },
      setLayout(parentId, layout) {
        commit(parentId === null ? { ...doc, layout } : updateBlock(doc, parentId, { layout }))
      },
      toggleLink(fromId, toId) {
        const links = doc.links ?? []
        const rest = links.filter(l => !(l.from === fromId && l.to === toId))
        if (rest.length === links.length) {
          commit(addLink(doc, { from: fromId, to: toId }).document)
        } else {
          // Filter directly: links in files may have no id.
          const { links: _, ...withoutLinks } = doc
          commit(rest.length ? { ...doc, links: rest } : withoutLinks)
        }
      },
    }
  }, [doc, onChange])

  return (
    <div className={`${styles.takeSix} ${className ?? ''}`}>
      {editable && (
        <button
          className={`${styles.modeToggle} ${editing ? styles.modeToggleEdit : ''}`}
          onClick={() => setEditing(e => !e)}
          aria-pressed={editing}
        >
          {editing ? <><CheckIcon />Done</> : <><PencilIcon />Edit</>}
        </button>
      )}

      <Viewer document={doc} editing={editing} actions={actions} />
    </div>
  )
}
