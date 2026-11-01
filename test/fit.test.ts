import { describe, expect, it } from 'vitest'
import { MIN_ZOOM, fitZoom } from '../src/fit.js'
import type { Rect } from '../src/geometry.js'

function rect(top: number, height: number, left = 0): Rect {
  return { left, top, width: 100, height, right: left + 100, bottom: top + height }
}

// Six full-width rows of 100 px with 16 px gaps: 600 + 5 × 16 = 680 px
const rows = [0, 1, 2, 3, 4, 5].map(i => rect(i * 116, 100))

describe('fitZoom', () => {
  it('keeps full size when the rows fit', () => {
    expect(fitZoom(800, rows, 16, 1)).toBe(1)
  })

  it('shrinks a level that is taller than the screen', () => {
    const zoom = fitZoom(612, rows, 16, 1)
    expect(zoom).toBeLessThan(1)
    expect(zoom).toBeCloseTo(612 / 680, 1)
  })

  it('counts a row once however many blocks it holds', () => {
    const twoPerRow = [rect(0, 100), rect(0, 80, 120), rect(116, 100), rect(116, 100, 120)]
    expect(fitZoom(200, twoPerRow, 16, 1)).toBeCloseTo(200 / 216, 1)
  })

  it('never goes below the minimum', () => {
    expect(fitZoom(100, rows, 16, 1)).toBe(MIN_ZOOM)
  })

  it('only shrinks, even when there is room', () => {
    const shrunk = rows.map(r => rect(r.top * 0.8, r.height * 0.8))
    expect(fitZoom(1000, shrunk, 16, 0.8)).toBe(0.8)
  })

  it('shrinks by at least a step while the rows still overflow', () => {
    expect(fitZoom(679, rows, 16, 1)).toBe(0.99)
  })

  it('leaves the zoom alone without anything to measure', () => {
    expect(fitZoom(0, rows, 16, 0.7)).toBe(0.7)
    expect(fitZoom(500, [], 16, 0.7)).toBe(0.7)
  })
})
