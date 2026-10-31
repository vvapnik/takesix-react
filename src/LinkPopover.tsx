import { useEffect, useRef, useState } from 'react'
import type { Link, LinkDirection } from '@takesix/core'
import { CrossIcon } from './icons.js'
import styles from './LinkPopover.module.css'

/** Changes to one link. A key set to `undefined` removes that field. */
export type LinkEdit = Partial<Pick<Link, 'from' | 'to' | 'label' | 'direction'>>

interface Props {
  /** The document links one arrow stands for: usually one, several when merged. */
  links: Link[]
  /** Where the arrow's middle is, relative to the arrow layer. */
  x: number
  y: number
  titleOf: (id: string) => string
  onUpdate: (link: Link, changes: LinkEdit) => void
  onRemove: (link: Link) => void
  onClose: () => void
}

const DIRECTIONS: Array<{ value: LinkDirection; symbol: string; label: string }> = [
  { value: 'forward', symbol: '→', label: 'One way' },
  { value: 'both', symbol: '↔', label: 'Both ways' },
  { value: 'none', symbol: '—', label: 'No direction' },
]

/** Edits the links behind one arrow: label, direction, reverse, delete. */
export function LinkPopover({ links, x, y, titleOf, onUpdate, onRemove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Click outside or Esc closes
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={styles.popover}
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={links.length === 1 ? 'Link' : `${links.length} links`}
      // Keep clicks inside from reaching cards and the backdrop
      onClick={e => e.stopPropagation()}
    >
      <button className={styles.close} onClick={onClose} aria-label="Close">
        <CrossIcon />
      </button>
      {links.map((link, i) => (
        <LinkRow
          key={link.id ?? i}
          link={link}
          titleOf={titleOf}
          onUpdate={changes => onUpdate(link, changes)}
          onRemove={() => onRemove(link)}
        />
      ))}
    </div>
  )
}

function LinkRow({ link, titleOf, onUpdate, onRemove }: {
  link: Link
  titleOf: (id: string) => string
  onUpdate: (changes: LinkEdit) => void
  onRemove: () => void
}) {
  const [label, setLabel] = useState(link.label ?? '')
  useEffect(() => setLabel(link.label ?? ''), [link.label])
  const direction = link.direction ?? 'forward'

  function commitLabel() {
    const next = label.trim()
    if (next !== (link.label ?? '')) onUpdate({ label: next || undefined })
  }

  return (
    <div className={styles.row}>
      <div className={styles.ends}>
        {titleOf(link.from)} <span className={styles.endsArrow}>{DIRECTIONS.find(d => d.value === direction)!.symbol}</span> {titleOf(link.to)}
      </div>
      <input
        className={styles.label}
        value={label}
        placeholder="Label"
        aria-label="Label"
        onChange={e => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitLabel() } }}
      />
      <div className={styles.actions}>
        <div className={styles.directions} role="group" aria-label="Direction">
          {DIRECTIONS.map(d => (
            <button
              key={d.value}
              className={`${styles.btn} ${direction === d.value ? styles.btnActive : ''}`}
              aria-pressed={direction === d.value}
              aria-label={d.label}
              title={d.label}
              // forward is the default: store it by dropping the field
              onClick={() => onUpdate({ direction: d.value === 'forward' ? undefined : d.value })}
            >
              {d.symbol}
            </button>
          ))}
        </div>
        <button
          className={styles.btn}
          onClick={() => onUpdate({ from: link.to, to: link.from })}
          aria-label="Reverse"
          title="Reverse"
          disabled={direction !== 'forward'}
        >
          ⇄
        </button>
        <button className={`${styles.btn} ${styles.danger}`} onClick={onRemove} aria-label="Delete link" title="Delete link">
          Delete
        </button>
      </div>
    </div>
  )
}
