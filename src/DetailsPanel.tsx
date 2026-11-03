import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Block } from '@takesix/core'
import { CollapseIcon, CrossIcon, ExpandIcon } from './icons.js'
import { Markdown } from './markdown.js'
import styles from './DetailsPanel.module.css'

interface Props {
  block: Block
  /** Screen rect of the control that opened it: the popup sits next to it. */
  anchor: DOMRect
  editing: boolean
  /** Saves the Markdown source; an empty string removes `details`. */
  onChange: (details: string) => void
  onClose: () => void
}

/** Space between the popup and the control it opened from, or the viewer's edge. */
const GAP = 8

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

/**
 * A block's long description (`details`, Markdown) in a small popup next to
 * the control that opened it: below it, right edges aligned, or above it
 * when there is no room below. It can grow to fill the whole viewer.
 */
export function DetailsPanel({ block, anchor, editing, onChange, onClose }: Props) {
  const [draft, setDraft] = useState(block.details ?? '')
  useEffect(() => setDraft(block.details ?? ''), [block.id, block.details])
  const [expanded, setExpanded] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLElement>(null)

  // Placed relative to the viewer's root (the popup's offset parent)
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.offsetParent ?? el?.parentElement
    if (!el || !parent || expanded) return
    const box = parent.getBoundingClientRect()
    const width = el.offsetWidth
    const height = el.offsetHeight
    const left = clamp(anchor.right - box.left - width, GAP, box.width - width - GAP)
    const below = anchor.bottom - box.top + GAP
    const top = below + height <= box.height - GAP ? below : anchor.top - box.top - GAP - height
    setPosition({ left, top: clamp(top, GAP, box.height - height - GAP) })
  }, [anchor, expanded, editing])

  // A press anywhere else closes it; the control that opened it reopens it
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

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
    <aside
      ref={ref}
      role="dialog"
      className={`${styles.panel} ${expanded ? styles.panelExpanded : ''}`}
      // Hidden for the first measurement, so it does not flash in the corner
      style={expanded ? undefined : position ?? { visibility: 'hidden' }}
      aria-label={`Details: ${block.title}`}
    >
      <div className={styles.controls}>
        <button
          className={styles.control}
          onClick={() => setExpanded(x => !x)}
          aria-label={expanded ? 'Shrink details' : 'Expand details'}
          title={expanded ? 'Shrink' : 'Expand to the whole view'}
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
        <button className={styles.control} onClick={onClose} aria-label="Close details">
          <CrossIcon />
        </button>
      </div>
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
