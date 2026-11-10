import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addBlock,
  addLink,
  canAddBlock,
  findBlock,
  groupBlocks,
  moveBlock,
  removeBlock,
  formatViewAddress,
  parseViewAddress,
  sameView,
  TakeSixError,
  updateBlock,
  type Link,
  type TakeSixDocument,
  type ViewAddress,
} from '@takesix/core'
import { copyText, screenLink } from './address.js'
import { useTypographyReady } from './ready.js'
import { Viewer, type ViewerActions } from './Viewer.js'
import { Menu, type MenuOptions } from './Menu.js'
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
  /** Colour theme. `auto` (default) follows the system setting. */
  theme?: Theme
  /**
   * Floating logo button in the bottom-left corner with a menu: open in the
   * online editor, save as HTML/JSON, version. Shown only while not editing.
   * `true` for the defaults, or options for the host (see `MenuOptions`).
   */
  menu?: boolean | MenuOptions
  /**
   * The screen shown: `{ in: id }` inside a block, `{ at: id }` the block's
   * level with the block outlined, `null` the top level. Pass it with
   * `onViewChange` to control the screen; leave it out and the component
   * keeps it itself.
   */
  view?: ViewAddress
  /** The reader moved to another screen. */
  onViewChange?: (view: ViewAddress) => void
  /**
   * Keep the screen in the page URL (`#in=<id>` / `#at=<id>`): it opens from
   * there, every move is a browser history entry, Back and Forward move
   * between screens, reload keeps the screen. Use it for one viewer per page
   * at most; others keep the URL untouched. Ignored while `view` is set.
   */
  syncUrl?: boolean
  className?: string
}

export type Theme = 'light' | 'dark' | 'auto'

const NEW_BLOCK = { title: 'New block', description: 'Description' }

/** Viewer and editor for a takesix document: one level on screen, click a block to open it. */
export function TakeSix({
  document: doc, onChange, editing: editingProp = false, theme = 'auto', menu = false,
  view: viewProp, onViewChange, syncUrl = false, className,
}: TakeSixProps) {
  const editing = onChange !== undefined && editingProp
  const controlled = viewProp !== undefined
  const urlSynced = syncUrl && !controlled
  // The screen when the host does not control it: from the URL when synced
  const [ownView, setOwnView] = useState<ViewAddress>(() => (urlSynced ? parseViewAddress(window.location.hash) : null))
  const view = controlled ? viewProp : ownView
  const ownViewRef = useRef(ownView)
  ownViewRef.current = ownView
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange

  const navigate = useCallback((next: ViewAddress) => {
    if (!controlled) setOwnView(next)
    if (urlSynced) {
      const hash = formatViewAddress(next, window.location.hash)
      // An empty fragment would leave a bare "#": drop it with the path
      const url = hash || window.location.pathname + window.location.search
      if (hash !== window.location.hash) window.history.pushState(null, '', url)
    }
    onViewChangeRef.current?.(next)
  }, [controlled, urlSynced])

  // Back and Forward (and an edited address bar) move between screens
  useEffect(() => {
    if (!urlSynced) return
    const onPop = () => {
      const next = parseViewAddress(window.location.hash)
      if (sameView(ownViewRef.current, next)) return
      setOwnView(next)
      onViewChangeRef.current?.(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [urlSynced])

  const copyLink = useCallback((target: ViewAddress) => copyText(screenLink(target)), [])

  const actions = useMemo<ViewerActions>(() => {
    const commit = (next: TakeSixDocument) => { if (next !== doc) onChange?.(next) }
    // Placing on the grid can fail (taken place, no room left): then nothing changes
    const attempt = (edit: () => TakeSixDocument) => {
      try {
        commit(edit())
      } catch (e) {
        if (!(e instanceof TakeSixError)) throw e
      }
    }
    return {
      rename(id, title) {
        const trimmed = title.trim()
        // An empty title is invalid in the format: keep the old one.
        if (trimmed) commit(updateBlock(doc, id, { title: trimmed }))
      },
      setShape(id, shape) {
        commit(updateBlock(doc, id, { shape: shape === 'process' ? undefined : shape }))
      },
      describe(id, description) {
        commit(updateBlock(doc, id, { description: description.trim() || undefined }))
      },
      renameDocument(title) {
        const trimmed = title.trim()
        if (trimmed && trimmed !== doc.title) commit({ ...doc, title: trimmed })
      },
      describeDocument(description) {
        const trimmed = description.trim()
        if (trimmed === (doc.description ?? '')) return
        const { description: _, ...rest } = doc
        commit(trimmed ? { ...doc, description: trimmed } : rest)
      },
      remove(id) {
        commit(removeBlock(doc, id))
      },
      add(parentId, at) {
        if (canAddBlock(doc, parentId)) attempt(() => addBlock(doc, parentId, at ? { ...NEW_BLOCK, at } : NEW_BLOCK).document)
      },
      makeText(id) {
        // Only an empty block: one with children keeps them
        attempt(() => updateBlock(doc, id, { details: '' }))
      },
      toBlocks(id) {
        if (findBlock(doc, id)?.details?.trim()) return
        attempt(() => addBlock(updateBlock(doc, id, { details: undefined }), id, NEW_BLOCK).document)
      },
      place(id, at) {
        attempt(() => updateBlock(doc, id, { at }))
      },
      move(id, parentId, at) {
        attempt(() => moveBlock(doc, id, parentId, at ? { at } : {}))
      },
      group(ids) {
        attempt(() => groupBlocks(doc, ids, { title: 'New group', description: `${ids.length} blocks` }).document)
      },
      setDetails(id, details) {
        // Emptied, it stays a text block: turning it back is a choice of its own (toBlocks)
        attempt(() => updateBlock(doc, id, { details }))
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

  const rootRef = useRef<HTMLDivElement>(null)
  const typography = useTypographyReady(rootRef)

  return (
    <div
      ref={rootRef}
      className={`${styles.takeSix} ${className ?? ''}`}
      data-theme={theme}
      // Laid out but not shown until styles and fonts are in (see useTypographyReady)
      style={typography.ready ? undefined : { visibility: 'hidden' }}
    >
      <Viewer
        document={doc}
        editing={editing}
        actions={actions}
        typographyTick={typography.ready ? typography.tick + 1 : 0}
        view={view}
        onNavigate={navigate}
        onCopyLink={copyLink}
      />
      {menu && !editing && <Menu document={doc} options={menu === true ? {} : menu} onCopyLink={() => copyLink(view)} />}
    </div>
  )
}
