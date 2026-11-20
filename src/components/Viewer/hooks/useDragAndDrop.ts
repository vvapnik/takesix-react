import { useCallback, useRef, useState, type RefObject } from 'react'
import {
  GRID_SIZE,
  MAX_BLOCKS_PER_LEVEL,
  formatArea,
  getLevel,
  type Area,
  type Block,
  type TakeSixDocument,
  type TreeIndex,
} from '@takesix/core'
import type { Cell } from '../../BlockCard/index.js'
import type { ViewerActions } from '../actions.js'
import { isFree, othersOf, type DropTarget } from '../layout.js'

interface Options {
  doc: TakeSixDocument
  index: TreeIndex
  editing: boolean
  actions: ViewerActions
  gridRef: RefObject<HTMLDivElement | null>
  /** The level's blocks and their places. */
  blocks: Block[]
  areas: Map<string, Area>
  /** Ids of the opened blocks, from the top: breadcrumb i + 1 shows level `path[i]`. */
  path: string[]
}

/**
 * Edit mode: dragging a block to another place on its level, into another
 * block, or onto a breadcrumb (up to that level).
 */
export function useDragAndDrop({ doc, index, editing, actions, gridRef, blocks, areas, path }: Options) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  // Where the dragged card was grabbed, from its top-left corner
  const dragOffset = useRef({ x: 0, y: 0 })
  // Breadcrumb a dragged block would move up to
  const [dropCrumb, setDropCrumb] = useState<number | null>(null)

  function startDrag(id: string, offset: { x: number; y: number }) {
    dragOffset.current = offset
    setDragId(id)
  }

  function endDrag() {
    setDragId(null)
    setDrop(null)
    setDropCrumb(null)
  }

  // Grid cell under a point, measured from the cells drawn in edit mode, so
  // rows of any height and the fit zoom are taken into account. Outside the
  // grid: the nearest cell.
  const cellAt = useCallback((x: number, y: number): Cell | null => {
    let best: Cell | null = null
    let bestDistance = Infinity
    for (const el of gridRef.current?.querySelectorAll<HTMLElement>('[data-cell]') ?? []) {
      const r = el.getBoundingClientRect()
      const dx = Math.max(r.left - x, 0, x - r.right)
      const dy = Math.max(r.top - y, 0, y - r.bottom)
      const distance = dx * dx + dy * dy
      if (distance < bestDistance) {
        bestDistance = distance
        const [col, row] = el.dataset.cell!.split(',').map(Number)
        best = { col: col!, row: row! }
      }
    }
    return best
  }, [gridRef])

  const canPlace = useCallback((id: string, area: Area) => isFree(area, othersOf(areas, id)), [areas])

  // While dragging: into the middle of a card with room for a child, or the
  // place under the dragged card's top-left corner.
  function dragOver(e: React.DragEvent) {
    if (!dragId) return
    e.preventDefault()
    const own = areas.get(dragId)
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-block-id]')
    const cardId = card?.dataset.blockId
    const target = cardId ? index.get(cardId)?.block : undefined
    if (card && target && cardId !== dragId && target.details === undefined && (target.children?.length ?? 0) < MAX_BLOCKS_PER_LEVEL) {
      const r = card.getBoundingClientRect()
      const tx = (e.clientX - r.left) / r.width
      const ty = (e.clientY - r.top) / r.height
      if (tx > 0.25 && tx < 0.75 && ty > 0.25 && ty < 0.75) {
        if (!(drop && 'inside' in drop && drop.inside === target.id)) setDrop({ inside: target.id })
        return
      }
    }
    if (!own) return
    // Aim a little inside the corner, so the cell is the one the corner covers
    const cell = cellAt(e.clientX - dragOffset.current.x + 8, e.clientY - dragOffset.current.y + 8)
    if (!cell) return
    const area = {
      col: Math.min(cell.col, GRID_SIZE - own.width),
      row: Math.min(cell.row, GRID_SIZE - own.height),
      width: own.width,
      height: own.height,
    }
    const same = drop && 'area' in drop && formatArea(drop.area) === formatArea(area)
    if (!same) setDrop({ area, ok: canPlace(dragId, area) })
  }

  function commitDrop() {
    if (dragId && drop && 'inside' in drop) {
      actions.move(dragId, drop.inside)
    } else if (dragId && drop && 'area' in drop && drop.ok) {
      const at = formatArea(drop.area)
      if (at !== blocks.find(b => b.id === dragId)?.at) actions.place(dragId, at)
    }
    endDrag()
  }

  // Level shown by breadcrumb i: the top level, then the opened blocks
  const crumbLevel = (i: number): string | null => (i === 0 ? null : path[i - 1]!)
  const levelHasRoom = (id: string | null) => getLevel(doc, id, index).length < MAX_BLOCKS_PER_LEVEL

  /** Handlers that let breadcrumb i take a dragged block up to its level. */
  const crumbDrop = (i: number) => editing && i < path.length ? {
    onDragOver: (e: React.DragEvent) => {
      if (!dragId || !levelHasRoom(crumbLevel(i))) return
      e.preventDefault()
      setDrop(null)
      if (dropCrumb !== i) setDropCrumb(i)
    },
    onDragLeave: () => setDropCrumb(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragId) actions.move(dragId, crumbLevel(i))
      endDrag()
    },
  } : {}

  /** Handlers for the level's grid. */
  const dropZone = editing ? {
    onDragOver: dragOver,
    onDrop: (e: React.DragEvent) => { e.preventDefault(); commitDrop() },
  } : {}

  return { dragId, drop, dropCrumb, startDrag, endDrag, cellAt, canPlace, crumbDrop, dropZone }
}
