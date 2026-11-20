import { GRID_SIZE, formatArea, overlap, type Area } from '@takesix/core'
import { areaStyle } from '../../BlockCard/index.js'
import { PlusIcon } from '../../Icons/index.js'
import { newBlockArea } from '../layout.js'
import styles from '../Viewer.module.css'

interface Props {
  /** Places taken by the level's blocks. */
  taken: Area[]
  /** Whether a block can be added to the level. */
  canAdd: boolean
  /** Adds a block at `at`. */
  onAdd: (at: string) => void
}

/**
 * Edit mode: the cells of the grid. Free ones add a block where clicked;
 * all of them tell drag and resize which cell is under the pointer.
 */
export function GridCells({ taken, canAdd, onAdd }: Props) {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
    const cell = { col: i % GRID_SIZE, row: Math.floor(i / GRID_SIZE) }
    const free = taken.every(t => !overlap(t, { ...cell, width: 1, height: 1 }))
    const name = formatArea({ ...cell, width: 1, height: 1 })
    const area = free && canAdd ? newBlockArea(cell, taken) : undefined
    return area ? (
      <button
        key={name}
        className={`${styles.cell} ${styles.cellFree}`}
        data-cell={`${cell.col},${cell.row}`}
        style={areaStyle({ ...cell, width: 1, height: 1 })}
        tabIndex={-1}
        title={`Add a block at ${name}`}
        aria-label={`Add block at ${name}`}
        onClick={() => onAdd(formatArea(area))}
      >
        <PlusIcon size={14} />
      </button>
    ) : (
      <div key={name} className={styles.cell} data-cell={`${cell.col},${cell.row}`} style={areaStyle({ ...cell, width: 1, height: 1 })} />
    )
  })
}
