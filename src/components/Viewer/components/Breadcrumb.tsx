import styles from '../Viewer.module.css'

interface Props {
  /** The document, then the opened blocks. */
  labels: string[]
  /** Breadcrumb a dragged block would move up to. */
  dropCrumb: number | null
  /** Goes up to the level of breadcrumb i (0 = top). */
  onGoTo: (i: number) => void
  /** A click on the strip around the crumbs: one level up, like the backdrop. */
  onUp: () => void
  /** Drag and drop handlers of breadcrumb i (edit mode). */
  crumbDrop: (i: number) => object
}

/** Only below the top level: there the header already names the document. */
export function Breadcrumb({ labels, dropCrumb, onGoTo, onUp, crumbDrop }: Props) {
  const last = labels.length - 1
  return (
    <nav
      className={styles.breadcrumb}
      aria-label="Breadcrumb"
      onClick={e => {
        if ((e.target as HTMLElement).closest('button')) return
        onUp()
      }}
    >
      {labels.map((label, i) => (
        <span key={i} className={styles.crumbItem}>
          {i > 0 && <span className={styles.crumbSep}>/</span>}
          <button
            className={`${styles.crumb} ${i === last ? styles.crumbActive : ''} ${dropCrumb === i ? styles.crumbDrop : ''}`}
            onClick={() => onGoTo(i)}
            disabled={i === last}
            aria-current={i === last ? 'location' : undefined}
            {...crumbDrop(i)}
          >
            {label}
          </button>
        </span>
      ))}
    </nav>
  )
}
