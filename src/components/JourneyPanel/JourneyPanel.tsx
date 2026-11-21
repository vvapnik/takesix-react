import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Journey, JourneyStep } from '@takesix/core'
import { CrossIcon, GripIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PlusIcon, PreviousIcon, StackIcon } from '../Icons/index.js'
import styles from './JourneyPanel.module.css'

/** Changes to the journey on screen; only where the document can be edited. */
export interface JourneyAuthoring {
  /** Adds the screen on view as a step after the current one. */
  addStep: () => void
  removeStep: (index: number) => void
  /** Moves the step at `from` to position `to`. */
  moveStep: (from: number, to: number) => void
  rename: (title: string) => void
  setLabel: (label: string) => void
  remove: () => void
}

interface Props {
  journey: Journey
  /** Index of the step on screen, from 0. */
  step: number
  playing: boolean
  /** What a step shows, for the list of steps: the titles of its blocks. */
  describeStep: (step: JourneyStep) => string
  onPrevious: () => void
  onNext: () => void
  onGoTo: (index: number) => void
  onTogglePlay: () => void
  onClose: () => void
  authoring?: JourneyAuthoring
}

type Popover = 'steps' | 'more' | null

/** Floating controls of the journey on screen, at the bottom of the diagram, in every mode. */
export function JourneyPanel({
  journey, step, playing, describeStep, onPrevious, onNext, onGoTo, onTogglePlay, onClose, authoring,
}: Props) {
  const count = journey.steps.length
  const current = journey.steps[step]
  const [open, setOpen] = useState<Popover>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const popoverId = useId()
  const toggle = (which: Exclude<Popover, null>) => setOpen(o => (o === which ? null : which))

  // A popover closes on Escape and on a click outside
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null) } }
    const onPointer = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(null) }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div ref={rootRef} className={styles.root} role="toolbar" aria-label={`Journey: ${journey.title}`} data-journey-panel="">
      {open === 'steps' && (
        <StepList
          id={popoverId}
          journey={journey}
          step={step}
          describeStep={describeStep}
          onGoTo={onGoTo}
          authoring={authoring}
        />
      )}

      {open === 'more' && authoring && (
        <div id={popoverId} className={styles.popover} role="group" aria-label="Edit journey">
          <label className={styles.field}>
            <span>Journey</span>
            <input
              key={`title-${journey.id}`}
              defaultValue={journey.title}
              onBlur={e => authoring.rename(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
          </label>
          {current && (
            <label className={styles.field}>
              <span>Step caption</span>
              <input
                key={`label-${journey.id}-${step}`}
                defaultValue={current.label ?? ''}
                placeholder="Shown with this step"
                onBlur={e => authoring.setLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </label>
          )}
          {current && <button type="button" className={styles.item} onClick={() => authoring.removeStep(step)}>Remove this step</button>}
          <button
            type="button"
            className={`${styles.item} ${styles.danger}`}
            onClick={() => { setOpen(null); authoring.remove() }}
          >
            Delete journey
          </button>
        </div>
      )}

      <div className={styles.bar}>
        <button type="button" className={styles.button} aria-label="Previous step" title="Previous step (←)" disabled={step <= 0} onClick={onPrevious}>
          <PreviousIcon />
        </button>
        <div className={styles.caption} aria-live="polite">
          <span className={styles.count}>{count ? `${step + 1} / ${count}` : 'No steps yet'}</span>
          <span className={styles.label}>{current?.label ?? journey.title}</span>
        </div>
        <button type="button" className={styles.button} aria-label="Next step" title="Next step (Space, →)" disabled={step >= count - 1} onClick={onNext}>
          <NextIcon />
        </button>
        <button
          type="button"
          className={styles.button}
          aria-label={playing ? 'Pause' : 'Play'}
          title={playing ? 'Pause' : 'Play: the steps move on by themselves'}
          disabled={count < 2}
          aria-pressed={playing}
          onClick={onTogglePlay}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className={styles.divider} aria-hidden="true" />
        {authoring && (
          <button
            type="button"
            className={styles.button}
            aria-label="Add this screen as a step"
            title="Add this screen as a step, after this one"
            onClick={authoring.addStep}
          >
            <PlusIcon size={16} />
          </button>
        )}
        <button
          type="button"
          className={styles.button}
          aria-label="All steps"
          title="All steps"
          aria-expanded={open === 'steps'}
          aria-controls={open === 'steps' ? popoverId : undefined}
          onClick={() => toggle('steps')}
        >
          <StackIcon />
        </button>
        {authoring && (
          <button
            type="button"
            className={styles.button}
            aria-label="Edit journey"
            aria-expanded={open === 'more'}
            aria-controls={open === 'more' ? popoverId : undefined}
            onClick={() => toggle('more')}
          >
            <MoreIcon />
          </button>
        )}
        <button type="button" className={styles.button} aria-label="Close journey" title="Close journey (Esc)" onClick={onClose}>
          <CrossIcon />
        </button>
      </div>
    </div>
  )
}

/**
 * The journey's table of contents: every step, the one on screen marked. A
 * click shows that step; where the document can be edited, a step can be
 * removed, dragged to another place, or moved with Alt+↑ / Alt+↓.
 */
function StepList({ id, journey, step, describeStep, onGoTo, authoring }: {
  id: string
  journey: Journey
  step: number
  describeStep: (step: JourneyStep) => string
  onGoTo: (index: number) => void
  authoring?: JourneyAuthoring
}) {
  // The step being dragged, and the gap it would drop into (0 … steps.length)
  const [dragged, setDragged] = useState<number | null>(null)
  const [gap, setGap] = useState<number | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  // After a keyboard move the focus follows the step
  const focusAfter = useRef<number | null>(null)
  useEffect(() => {
    if (focusAfter.current === null) return
    listRef.current?.querySelectorAll<HTMLElement>('[data-step-go]')[focusAfter.current]?.focus()
    focusAfter.current = null
  })

  const move = (from: number, to: number) => {
    if (!authoring || to < 0 || to >= journey.steps.length || to === from) return
    authoring.moveStep(from, to)
  }

  // Dragging by the grip with any pointer (mouse, pen, finger): the gap is
  // where the pointer is between the rows' middles
  const gapAt = (y: number) => {
    const rows = [...(listRef.current?.children ?? [])] as HTMLElement[]
    const index = rows.findIndex(row => { const r = row.getBoundingClientRect(); return y < r.top + r.height / 2 })
    return index === -1 ? rows.length : index
  }
  const startDrag = (e: ReactPointerEvent<HTMLElement>, index: number) => {
    if (!authoring || e.button !== 0) return
    e.preventDefault()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    setDragged(index)
    setGap(index)
    let last = index
    const onMove = (m: PointerEvent) => { last = gapAt(m.clientY); setGap(last) }
    const finish = (drop: boolean) => {
      grip.removeEventListener('pointermove', onMove)
      grip.removeEventListener('pointerup', onUp)
      grip.removeEventListener('pointercancel', onCancel)
      setDragged(null)
      setGap(null)
      if (drop) move(index, last > index ? last - 1 : last)
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    grip.addEventListener('pointermove', onMove)
    grip.addEventListener('pointerup', onUp)
    grip.addEventListener('pointercancel', onCancel)
  }

  return (
    <div id={id} className={`${styles.popover} ${styles.steps}`} role="group" aria-label="All steps">
      <p className={styles.stepsTitle}>{journey.title}</p>
      {journey.steps.length === 0 && <p className={styles.stepsEmpty}>No steps yet{authoring ? ': open a screen and press +' : ''}</p>}
      <ol ref={listRef} className={styles.stepList}>
        {journey.steps.map((s, i) => {
          const title = s.label ?? describeStep(s)
          return (
            <li
              key={i}
              className={[
                styles.stepRow,
                i === step ? styles.stepCurrent : '',
                dragged === i ? styles.stepDragged : '',
                dragged !== null && gap === i && gap !== dragged && gap !== dragged + 1 ? styles.gapBefore : '',
                dragged !== null && gap === i + 1 && i === journey.steps.length - 1 && gap !== dragged + 1 ? styles.gapAfter : '',
              ].join(' ')}
            >
              {authoring && (
                <span className={styles.grip} aria-hidden="true" data-step-grip="" onPointerDown={e => startDrag(e, i)}>
                  <GripIcon />
                </span>
              )}
              <button
                type="button"
                className={styles.stepGo}
                data-step-go=""
                aria-current={i === step ? 'step' : undefined}
                title={authoring ? 'Show this step. Alt+↑ / Alt+↓ moves it' : 'Show this step'}
                onClick={() => onGoTo(i)}
                onKeyDown={e => {
                  if (!authoring || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
                  e.preventDefault()
                  const to = i + (e.key === 'ArrowUp' ? -1 : 1)
                  if (to < 0 || to >= journey.steps.length) return
                  focusAfter.current = to
                  move(i, to)
                }}
              >
                <span className={styles.stepNumber}>{i + 1}</span>
                <span className={styles.stepText}>
                  <span className={styles.stepTitle}>{title}</span>
                  {s.label && <span className={styles.stepWhere}>{describeStep(s)}</span>}
                </span>
              </button>
              {authoring && (
                <button
                  type="button"
                  className={styles.stepRemove}
                  aria-label={`Remove step ${i + 1}`}
                  title="Remove this step"
                  onClick={() => authoring.removeStep(i)}
                >
                  <CrossIcon />
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
