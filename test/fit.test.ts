import { describe, expect, it } from 'vitest'
import { MIN_ZOOM, fitZoom } from '../src/fit.js'

describe('fitZoom', () => {
  it('keeps full size when everything fits', () => {
    expect(fitZoom(1, 1)).toBe(1)
    expect(fitZoom(0.5, 1)).toBe(1)
    // a pixel of rounding does not count
    expect(fitZoom(1.005, 1)).toBe(1)
  })

  it('shrinks by how much the content overflows', () => {
    // content 680 px in a 612 px box
    expect(fitZoom(680 / 612, 1)).toBeCloseTo(612 / 680, 1)
    expect(fitZoom(1.25, 0.9)).toBe(0.72)
  })

  it('never goes below the minimum', () => {
    expect(fitZoom(10, 1)).toBe(MIN_ZOOM)
    expect(fitZoom(2, MIN_ZOOM)).toBe(MIN_ZOOM)
  })

  it('only shrinks, even when there is room', () => {
    expect(fitZoom(0.5, 0.8)).toBe(0.8)
  })

  it('shrinks by at least a step while the content still overflows', () => {
    expect(fitZoom(1.011, 1)).toBe(0.98)
    expect(fitZoom(1.02, 0.99)).toBe(0.97)
  })

  it('leaves the zoom alone without a measurement', () => {
    expect(fitZoom(Number.NaN, 0.7)).toBe(0.7)
  })
})
