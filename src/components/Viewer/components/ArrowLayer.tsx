import { useId } from 'react'
import { HEAD_MARKER, HEAD_PATH, labelPlacement, pairKey, type Arrow } from '../arrows.js'
import styles from '../Viewer.module.css'

interface Props {
  arrows: Arrow[]
  editing: boolean
  /** Editing: layout problems of an arrow, by its key, explained on hover. */
  warnings: Map<string, string[]>
  /** The arrow whose links are being edited, by its pair of blocks (see pairKey). */
  openArrow: string | null
  onOpen: (pair: string) => void
  titleOf: (id: string) => string
}

/** The level's arrows, and their labels in pills over the lines. */
export function ArrowLayer({ arrows, editing, warnings, openArrow, onOpen, titleOf }: Props) {
  const markerId = useId()
  const warnMarkerId = useId()
  if (!arrows.length) return null

  return <>
    <svg className={`${styles.arrowSvg} ${editing ? styles.arrowSvgEditing : ''}`} aria-hidden={editing ? undefined : true}>
      <defs>
        {/* Base of the head at the path end (refX 0): the head continues the line. */}
        <marker id={markerId} {...HEAD_MARKER}>
          <path d={HEAD_PATH} className={styles.arrowHead} />
        </marker>
        <marker id={warnMarkerId} {...HEAD_MARKER}>
          <path d={HEAD_PATH} className={styles.arrowHeadWarn} />
        </marker>
      </defs>
      {arrows.map(a => {
        // Editing only: a layout problem, explained on hover
        const reasons = warnings.get(a.key)
        const head = `url(#${reasons ? warnMarkerId : markerId})`
        return (
          <g key={a.key} data-link={a.key} data-layout-warning={reasons ? true : undefined}>
            {editing && (
              // Wide invisible stroke: easy to hit, opens the link editor
              <path
                d={a.d}
                className={styles.arrowHit}
                role="button"
                aria-label={`Edit link ${titleOf(a.link.from)} – ${titleOf(a.link.to)}`}
                aria-description={reasons?.join('. ')}
                onClick={e => { e.stopPropagation(); onOpen(pairKey(a.link)) }}
              >
                {reasons && <title>{reasons.join('\n')}</title>}
              </path>
            )}
            <path
              d={a.d}
              className={`${styles.arrow} ${a.link.style === 'solid' ? '' : styles[a.link.style]} ${reasons ? styles.arrowWarn : ''}`}
              markerEnd={a.link.direction !== 'none' ? head : undefined}
              markerStart={a.link.direction === 'both' ? head : undefined}
            />
          </g>
        )
      })}
    </svg>

    {arrows.some(a => a.label) && (
      // Labels in pills over the lines: HTML, so a pill fits its text
      <div className={`${styles.arrowLabels} ${editing ? styles.arrowLabelsEditing : ''}`} aria-hidden={editing ? undefined : true}>
        {arrows.map(a => {
          if (!a.label) return null
          const { x, shift } = labelPlacement({ ...a, label: a.label })
          return (
            <span
              key={a.key}
              data-link={a.key}
              className={`${styles.arrowLabel} ${openArrow === pairKey(a.link) ? styles.arrowLabelOpen : ''}`}
              style={{ left: x, top: a.mid.y, transform: `translate(${shift}, -50%)` }}
              onClick={editing ? e => { e.stopPropagation(); onOpen(pairKey(a.link)) } : undefined}
            >
              {a.label}
            </span>
          )
        })}
      </div>
    )}
  </>
}
