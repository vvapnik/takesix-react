import { GRID_SIZE, fitsGrid, overlap, type Area } from '@takesix/core'
import type { Cell } from '../BlockCard/index.js'

/** Where a dragged block would land: into another block, or on a place of this level. */
export type DropTarget = { inside: string } | { area: Area; ok: boolean }

/** Areas of `areas` other than block `id`'s own. */
export function othersOf(areas: Map<string, Area>, id: string): Area[] {
  return [...areas].filter(([other]) => other !== id).map(([, a]) => a)
}

export const isFree = (area: Area, taken: Area[]) => fitsGrid(area) && taken.every(t => !overlap(t, area))

/** Area for a new block started in `cell`: half the grid wide when free, else narrower. */
export function newBlockArea(cell: Cell, taken: Area[]): Area | undefined {
  for (const width of [3, 2, 1]) {
    const area = { ...cell, width, height: 1 }
    if (isFree(area, taken)) return area
  }
  return undefined
}

/**
 * Ends the description in a card's text box (`[data-fit]`, measured in full
 * and too tall) with "…" after the lines that fit. Element sizes only, so
 * the level's zoom does not matter.
 */
export function clampDescription(text: HTMLElement) {
  const description = text.querySelector<HTMLElement>('[data-clamp]')
  if (!description) return
  const excess = text.scrollHeight - text.clientHeight
  const full = description.offsetHeight
  text.setAttribute('data-clipped', '')
  description.style.setProperty('--ts-lines', '1')
  const line = description.offsetHeight
  if (!line) return
  const lines = Math.floor((full - excess) / line)
  // Not even one line: the title takes the room, the description goes
  if (lines < 1) text.setAttribute('data-clipped', 'all')
  else description.style.setProperty('--ts-lines', String(lines))
}

/**
 * The whole 6×6 grid, cells of one size filling the screen, the same when
 * viewing and editing, so nothing moves between the modes. Phones (viewing
 * only) get a compact grid instead: the rows in use, as tall as their
 * content, and empty columns and rows shrunk away (see .grid).
 */
export function gridStyle(areas: Map<string, Area>, editing: boolean): React.CSSProperties {
  const usedRows = Math.max(0, ...[...areas.values()].map(a => a.row + a.height))
  const covered = (test: (a: Area) => boolean) => [...areas.values()].some(test)
  // Viewing, the rows below the last block are left out, so the blocks get
  // the room; editing keeps all six to place blocks in
  const fullRows = editing ? GRID_SIZE : Math.max(1, usedRows)
  return {
    gridTemplateColumns: editing
      ? `repeat(${GRID_SIZE}, minmax(0, 1fr))`
      : Array.from({ length: GRID_SIZE }, (_, c) =>
          covered(a => a.col <= c && c < a.col + a.width) ? 'minmax(0, 1fr)' : 'var(--ts-empty-col)').join(' '),
    '--ts-rows-full': `repeat(${fullRows}, minmax(0, 1fr))`,
    // Rows shown, for the grid's least height (see .grid)
    '--ts-rows': fullRows,
    // How many times the six rows are taller than the rows shown: the grid
    // keeps the proportions of its cells, not of the whole 6×6 grid
    '--ts-row-share': GRID_SIZE / fullRows,
    '--ts-rows-compact': Array.from({ length: Math.max(1, usedRows) }, (_, r) =>
      covered(a => a.row <= r && r < a.row + a.height) ? 'auto' : '0px').join(' '),
  } as React.CSSProperties
}
