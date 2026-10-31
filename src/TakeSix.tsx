import { useMemo } from 'react'
import {
  addBlock,
  addLink,
  canAddBlock,
  moveBlock,
  removeBlock,
  updateBlock,
  type Link,
  type TakeSixDocument,
} from '@takesix/core'
import { Viewer, type ViewerActions } from './Viewer.js'
import styles from './TakeSix.module.css'

export interface TakeSixProps {
  /** The diagram to show. Expected to be valid: run `parseDocument` from `@takesix/core` on untrusted input. */
  document: TakeSixDocument
  /** Called with the edited document. Without it the diagram stays read-only. */
  onChange?: (document: TakeSixDocument) => void
  /**
   * Show the edit controls. The toggle lives in the host app (e.g. its toolbar),
   * so the component itself is only the view. Ignored without `onChange`.
   */
  editing?: boolean
  className?: string
}

const NEW_BLOCK = { title: 'New block', description: 'Description' }

/** Viewer and editor for a takesix document: one level on screen, click a block to open it. */
export function TakeSix({ document: doc, onChange, editing: editingProp = false, className }: TakeSixProps) {
  const editing = onChange !== undefined && editingProp

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
      move(id, parentId, index) {
        commit(moveBlock(doc, id, parentId, { index }))
      },
      setDetails(id, details) {
        commit(updateBlock(doc, id, { details: details.trim() ? details : undefined }))
      },
      updateLink(link, changes) {
        const next = { ...link } as Record<string, unknown>
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) delete next[key]
          else next[key] = value
        }
        commit({ ...doc, links: (doc.links ?? []).map(l => (l === link ? next as unknown as Link : l)) })
      },
      removeLink(link) {
        const rest = (doc.links ?? []).filter(l => l !== link)
        const { links: _, ...withoutLinks } = doc
        commit(rest.length ? { ...doc, links: rest } : withoutLinks)
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
      <Viewer document={doc} editing={editing} actions={actions} />
    </div>
  )
}
