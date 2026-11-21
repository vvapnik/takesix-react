import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addBlock,
  addJourney,
  addJourneyStep,
  addLink,
  canAddBlock,
  DEFAULT_STEP_DURATION,
  findJourney,
  formatJourneyAddress,
  parseJourneyAddress,
  removeJourney,
  moveJourneyStep,
  removeJourneyStep,
  stepView,
  updateJourney,
  updateJourneyStep,
  viewStep,
  findBlock,
  groupBlocks,
  moveBlock,
  removeBlock,
  formatViewAddress,
  parseViewAddress,
  sameView,
  TakeSixError,
  updateBlock,
  type JourneyAddress,
  type JourneyStep,
  type Link,
  type TakeSixDocument,
  type ViewAddress,
} from '@takesix/core'
import { copyText, screenLink } from '../../utils/address.js'
import { useTypographyReady } from '../../utils/ready.js'
import { Viewer, type ViewerActions } from '../Viewer/index.js'
import { Menu, type MenuOptions } from '../Menu/index.js'
import { JourneyPanel, type JourneyAuthoring } from '../JourneyPanel/index.js'
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
  /**
   * The journey on screen and its step (`step` from 0), `null` for none.
   * Pass it with `onJourneyChange` to control it; leave it out and the
   * component keeps it itself, in the URL with `syncUrl`
   * (`#journey=<id>&step=<n>`).
   */
  journey?: JourneyAddress | null
  /** A journey was started, moved to another step or closed. */
  onJourneyChange?: (journey: JourneyAddress | null) => void
  className?: string
}

export type Theme = 'light' | 'dark' | 'auto'

const NEW_BLOCK = { title: 'New block', description: 'Description' }

/** Viewer and editor for a takesix document: one level on screen, click a block to open it. */
export function TakeSix({
  document: doc, onChange, editing: editingProp = false, theme = 'auto', menu = false,
  view: viewProp, onViewChange, syncUrl = false, journey: journeyProp, onJourneyChange, className,
}: TakeSixProps) {
  const editing = onChange !== undefined && editingProp
  const controlled = viewProp !== undefined
  const urlSynced = syncUrl && !controlled
  const journeyControlled = journeyProp !== undefined
  const journeyUrlSynced = syncUrl && !journeyControlled
  // The journey when the host does not control it: from the URL when synced
  const [ownJourney, setOwnJourney] = useState<JourneyAddress | null>(
    () => (journeyUrlSynced ? parseJourneyAddress(window.location.hash) : null),
  )
  const journeyAddress = journeyControlled ? journeyProp : ownJourney
  // The screen when the host does not control it: from the URL when synced;
  // a journey step alone in the URL shows that step's screen
  const [ownView, setOwnView] = useState<ViewAddress>(() => {
    if (!urlSynced) return null
    const fromUrl = parseViewAddress(window.location.hash)
    if (fromUrl || !ownJourney) return fromUrl
    const steps = findJourney(doc, ownJourney.journey)?.steps ?? []
    const step = steps[Math.min(ownJourney.step, steps.length - 1)]
    return step ? stepView(step) : null
  })
  const view = controlled ? viewProp : ownView
  const ownViewRef = useRef(ownView)
  ownViewRef.current = ownView
  const ownJourneyRef = useRef(ownJourney)
  ownJourneyRef.current = ownJourney
  const onViewChangeRef = useRef(onViewChange)
  onViewChangeRef.current = onViewChange
  const onJourneyChangeRef = useRef(onJourneyChange)
  onJourneyChangeRef.current = onJourneyChange

  // The journey last reported to the host: a different `journey` prop is the host's own move
  const reportedJourney = useRef(journeyAddress)

  /** Moves to a screen and/or a journey step (`undefined`: unchanged), as one history entry. */
  const go = useCallback((nextView: ViewAddress | undefined, nextJourney?: JourneyAddress | null) => {
    if (nextJourney !== undefined) reportedJourney.current = nextJourney
    if (nextView !== undefined && !controlled) setOwnView(nextView)
    if (nextJourney !== undefined && !journeyControlled) setOwnJourney(nextJourney)
    if (urlSynced || journeyUrlSynced) {
      let hash = window.location.hash
      if (urlSynced && nextView !== undefined) hash = formatViewAddress(nextView, hash)
      if (journeyUrlSynced && nextJourney !== undefined) hash = formatJourneyAddress(nextJourney, hash)
      // An empty fragment would leave a bare "#": drop it with the path
      const url = hash || window.location.pathname + window.location.search
      if (hash !== window.location.hash) window.history.pushState(null, '', url)
    }
    if (nextView !== undefined) onViewChangeRef.current?.(nextView)
    if (nextJourney !== undefined) onJourneyChangeRef.current?.(nextJourney)
  }, [controlled, urlSynced, journeyControlled, journeyUrlSynced])

  // Back and Forward (and an edited address bar) move between screens and steps
  useEffect(() => {
    if (!urlSynced && !journeyUrlSynced) return
    const onPop = () => {
      if (urlSynced) {
        const next = parseViewAddress(window.location.hash)
        if (!sameView(ownViewRef.current, next)) {
          setOwnView(next)
          onViewChangeRef.current?.(next)
        }
      }
      if (journeyUrlSynced) {
        const next = parseJourneyAddress(window.location.hash)
        const was = ownJourneyRef.current
        if (next?.journey !== was?.journey || next?.step !== was?.step) {
          setOwnJourney(next)
          onJourneyChangeRef.current?.(next)
        }
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [urlSynced, journeyUrlSynced])

  // The journey on screen, if its id is in the document; the step kept in range
  const journey = journeyAddress ? findJourney(doc, journeyAddress.journey) : undefined
  const step = journey ? Math.max(0, Math.min(journeyAddress!.step, journey.steps.length - 1)) : 0
  const [playing, setPlaying] = useState(false)
  const goToStep = useCallback((index: number) => {
    if (!journey) return
    const target = journey.steps[index]
    if (!target) return
    go(stepView(target), { journey: journey.id, step: index })
  }, [journey, go])
  const startJourney = useCallback((id: string, play = true) => {
    const steps = findJourney(doc, id)?.steps ?? []
    setPlaying(play && steps.length > 1)
    go(steps[0] ? stepView(steps[0]) : undefined, { journey: id, step: 0 })
  }, [doc, go])
  const closeJourney = useCallback(() => {
    setPlaying(false)
    go(undefined, null)
  }, [go])
  // A reader moving on their own pauses the journey, so it does not pull them away
  const navigate = useCallback((next: ViewAddress) => {
    setPlaying(false)
    go(next)
  }, [go])

  // The host started a journey or moved it (its own menu): show that step;
  // a journey started from outside plays, like one started from our menu
  useEffect(() => {
    if (!journeyControlled) return
    const was = reportedJourney.current
    reportedJourney.current = journeyProp
    if (!journeyProp) {
      setPlaying(false)
      return
    }
    if (was?.journey === journeyProp.journey && was.step === journeyProp.step) return
    const steps = findJourney(doc, journeyProp.journey)?.steps ?? []
    const target = steps[Math.max(0, Math.min(journeyProp.step, steps.length - 1))]
    if (target) go(stepView(target))
    if (was?.journey !== journeyProp.journey) setPlaying(steps.length > 1)
    // Only a new address from the host counts; the document is read as it is then
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyControlled, journeyProp?.journey, journeyProp?.step])

  // Playing: each step stays its duration, then the next one comes; the last one stops
  const stepDuration = journey?.steps[step]?.duration ?? DEFAULT_STEP_DURATION
  useEffect(() => {
    if (!playing || !journey) return
    if (step >= journey.steps.length - 1) {
      setPlaying(false)
      return
    }
    const timer = setTimeout(() => goToStep(step + 1), stepDuration * 1000)
    return () => clearTimeout(timer)
  }, [playing, journey, step, stepDuration, goToStep])

  // Keys while a journey is on: Space and → next, ← back, Esc closes. Not
  // while typing or on a control, which handles the key itself.
  useEffect(() => {
    if (!journey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      const target = e.target
      if (target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable=""], [contenteditable="true"]')) return
      if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown') goToStep(step + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goToStep(step - 1)
      else if (e.key === 'Escape') closeJourney()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [journey, step, goToStep, closeJourney])

  // Making journeys: wherever the document can be edited
  const journeyActions = useMemo(() => {
    if (!onChange) return undefined
    return {
      create(): void {
        const n = (doc.journeys?.length ?? 0) + 1
        const { document: next, journey: created } = addJourney(doc, { title: `Journey ${n}` })
        onChange(next)
        setPlaying(false)
        go(undefined, { journey: created.id, step: 0 })
      },
    }
  }, [doc, onChange, go])

  // A step in the list of steps: the block it shows, or the document for the top level
  const describeStep = (s: JourneyStep) => {
    const id = s.in ?? s.at
    return id === undefined ? doc.title : findBlock(doc, id)?.title ?? id
  }

  const authoring: JourneyAuthoring | undefined = onChange && journey ? {
    addStep() {
      const at = journey.steps.length ? step + 1 : 0
      onChange(addJourneyStep(doc, journey.id, viewStep(view), at))
      setPlaying(false)
      go(undefined, { journey: journey.id, step: at })
    },
    removeStep(index) {
      if (!journey.steps[index]) return
      onChange(removeJourneyStep(doc, journey.id, index))
      // The step on screen stays the same step; when it goes, the one after it takes its place
      const kept = index < step ? step - 1 : step
      const nextIndex = Math.max(0, Math.min(kept, journey.steps.length - 2))
      if (nextIndex !== step) go(undefined, { journey: journey.id, step: nextIndex })
    },
    moveStep(from, to) {
      if (!journey.steps[from] || !journey.steps[to] || from === to) return
      onChange(moveJourneyStep(doc, journey.id, from, to))
      // The step on screen keeps its place in the journey, wherever it moved
      let next = step
      if (from === step) next = to
      else if (from < step && to >= step) next = step - 1
      else if (from > step && to <= step) next = step + 1
      if (next !== step) go(undefined, { journey: journey.id, step: next })
    },
    rename(title) {
      const trimmed = title.trim()
      if (trimmed && trimmed !== journey.title) onChange(updateJourney(doc, journey.id, { title: trimmed }))
    },
    setLabel(label) {
      const current = journey.steps[step]
      if (!current || (current.label ?? '') === label.trim()) return
      onChange(updateJourneyStep(doc, journey.id, step, { ...current, label: label.trim() || undefined }))
    },
    remove() {
      setPlaying(false)
      onChange(removeJourney(doc, journey.id))
      go(undefined, null)
    },
  } : undefined

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
      setTone(id, tone) {
        commit(updateBlock(doc, id, { tone: tone === 'neutral' ? undefined : tone }))
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
      {menu && !editing && (
        <Menu
          document={doc}
          options={menu === true ? {} : menu}
          onCopyLink={() => copyLink(view)}
          journeys={{ active: journey?.id, onStart: startJourney, onCreate: journeyActions?.create }}
        />
      )}
      {journey && (
        <JourneyPanel
          journey={journey}
          step={step}
          playing={playing}
          describeStep={describeStep}
          onPrevious={() => goToStep(step - 1)}
          onNext={() => goToStep(step + 1)}
          onGoTo={index => { setPlaying(false); goToStep(index) }}
          onTogglePlay={() => {
            // Play from the start when at the end
            if (!playing && step >= journey.steps.length - 1) goToStep(0)
            setPlaying(p => !p)
          }}
          onClose={closeJourney}
          authoring={authoring}
        />
      )}
    </div>
  )
}
