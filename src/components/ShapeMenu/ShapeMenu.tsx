import { useEffect, useRef, useState } from 'react'
import { BLOCK_SHAPES, BLOCK_TONES, type BlockShape, type BlockTone } from '@takesix/core'
import { longHex, TONE_NAMES, toneColor, toneName } from '../../utils/tone.js'
import styles from './ShapeMenu.module.css'

/** Names of the flowchart symbols: tooltips, screen readers and the caption. */
export const SHAPE_NAMES: Record<BlockShape, string> = {
  'process': 'Process',
  'terminator': 'Start or end',
  'decision': 'Decision',
  'io': 'Data in or out',
  'subprocess': 'Subprocess',
  'loop-start': 'Loop start',
  'loop-end': 'Loop end',
}

/** Outline of a symbol in a 16×12 box. */
const GLYPHS: Record<BlockShape, string> = {
  'process': 'M 1 1.5 H 15 V 10.5 H 1 Z',
  'terminator': 'M 5 1.5 H 11 A 4.5 4.5 0 0 1 11 10.5 H 5 A 4.5 4.5 0 0 1 5 1.5 Z',
  'decision': 'M 8 0.5 L 15.5 6 L 8 11.5 L 0.5 6 Z',
  'io': 'M 4 1.5 H 15 L 12 10.5 H 1 Z',
  'subprocess': 'M 1 1.5 H 15 V 10.5 H 1 Z M 3.5 1.5 V 10.5 M 12.5 1.5 V 10.5',
  'loop-start': 'M 4 1.5 H 12 L 15 4.5 V 10.5 H 1 V 4.5 Z',
  'loop-end': 'M 1 1.5 H 15 V 7.5 L 12 10.5 H 4 L 1 7.5 Z',
}

/** A flowchart symbol drawn as a small outline. */
export function ShapeGlyph({ shape, width = 16 }: { shape: BlockShape; width?: number }) {
  return (
    <svg width={width} height={(width * 12) / 16} viewBox="0 0 16 12" aria-hidden="true">
      <path d={GLYPHS[shape]} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

interface Props {
  /** The block's current shape. */
  value: BlockShape
  /** Bottom right corner of the button that opened the menu, relative to the level's area. */
  x: number
  y: number
  onPick: (shape: BlockShape) => void
  /** The block's tone; with `onPickTone`, the menu also picks it. */
  tone?: BlockTone
  /** `undefined`: neutral. */
  onPickTone?: (tone: BlockTone | undefined) => void
  onClose: () => void
}

/** Neutral, accent, success, warning, danger: a dot of the colour each stands for. */
function ToneDot({ color }: { color: string | undefined }) {
  return <span className={styles.dot} style={color ? { '--ts-tone': color } as React.CSSProperties : undefined} data-tone={color ? '' : undefined} />
}

/**
 * Picks a block's flowchart symbol from their outlines and, with `onPickTone`,
 * its colour; the name of the option under the pointer shows below.
 */
export function ShapeMenu({ value, x, y, onPick, tone, onPickTone, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const colorRef = useRef<HTMLInputElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const currentTone = toneName(tone)
  // A colour of the block's own: the colour input, set once the picker closes
  const ownColor = currentTone === undefined && toneColor(tone) ? longHex(tone!) : undefined
  const onPickToneRef = useRef(onPickTone)
  onPickToneRef.current = onPickTone

  // Click outside or Esc closes; the current symbol takes the focus
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
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

  // The native change event: once, when the colour is chosen, not on every move
  useEffect(() => {
    const input = colorRef.current
    if (!input) return
    const onChange = () => { onPickToneRef.current?.(input.value as BlockTone); onClose() }
    input.addEventListener('change', onChange)
    return () => input.removeEventListener('change', onChange)
  }, [onClose])

  // Arrow keys move between the options of a group, like in a radio group
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const buttons = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(i + step + buttons.length) % buttons.length]?.focus()
  }

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: x, top: y }}
      role="dialog"
      aria-label={onPickTone ? 'Shape and colour' : 'Shape'}
      onClick={e => e.stopPropagation()}
    >
      <div className={styles.options} role="radiogroup" aria-label="Shape" onKeyDown={onKeyDown}>
        {BLOCK_SHAPES.map(shape => (
          <button
            key={shape}
            className={`${styles.option} ${shape === value ? styles.optionActive : ''}`}
            role="radio"
            aria-checked={shape === value}
            aria-label={SHAPE_NAMES[shape]}
            title={SHAPE_NAMES[shape]}
            tabIndex={shape === value ? 0 : -1}
            onPointerEnter={() => setHovered(SHAPE_NAMES[shape])}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered(SHAPE_NAMES[shape])}
            onClick={() => { if (shape !== value) onPick(shape); onClose() }}
          >
            <ShapeGlyph shape={shape} width={24} />
          </button>
        ))}
      </div>
      {onPickTone && (
        <div className={styles.tones} role="radiogroup" aria-label="Colour" onKeyDown={onKeyDown}>
          {BLOCK_TONES.map(name => (
            <button
              key={name}
              className={`${styles.option} ${styles.tone} ${name === currentTone ? styles.toneActive : ''}`}
              role="radio"
              aria-checked={name === currentTone}
              aria-label={TONE_NAMES[name]}
              title={TONE_NAMES[name]}
              tabIndex={name === currentTone ? 0 : -1}
              onPointerEnter={() => setHovered(TONE_NAMES[name])}
              onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered(TONE_NAMES[name])}
              onClick={() => { if (name !== currentTone) onPickTone(name === 'neutral' ? undefined : name); onClose() }}
            >
              <ToneDot color={toneColor(name)} />
            </button>
          ))}
          {/* A colour of the block's own: the system colour picker */}
          <label
            className={`${styles.option} ${styles.tone} ${currentTone === undefined ? styles.toneActive : ''}`}
            role="radio"
            aria-checked={currentTone === undefined}
            aria-label="Your colour"
            title="Your colour"
            tabIndex={currentTone === undefined ? 0 : -1}
            onPointerEnter={() => setHovered('Your colour')}
            onPointerLeave={() => setHovered(null)}
            onFocus={() => setHovered('Your colour')}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); colorRef.current?.click() } }}
          >
            <span className={`${styles.dot} ${styles.dotOwn}`} style={ownColor ? { '--ts-tone': ownColor } as React.CSSProperties : undefined} data-tone={ownColor ? '' : undefined} />
            <input ref={colorRef} className={styles.colorInput} type="color" tabIndex={-1} defaultValue={ownColor ?? '#7a5af8'} aria-hidden="true" />
          </label>
        </div>
      )}
      <div className={styles.caption} aria-hidden="true">{hovered ?? SHAPE_NAMES[value]}</div>
    </div>
  )
}
