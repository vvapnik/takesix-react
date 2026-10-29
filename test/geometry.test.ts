import { describe, expect, it } from 'vitest'
import { bezierMid, determineEdges, routeArrows, type Rect } from '../src/geometry.js'

function rect(left: number, top: number, width = 100, height = 60): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

const container = rect(0, 0, 1000, 1000)

describe('determineEdges', () => {
  it('connects side by side cards through facing edges', () => {
    expect(determineEdges(rect(0, 0), rect(200, 0), [])).toEqual({ exitEdge: 'right', entryEdge: 'left' })
    expect(determineEdges(rect(200, 0), rect(0, 0), [])).toEqual({ exitEdge: 'left', entryEdge: 'right' })
  })

  it('goes around a card standing in between', () => {
    expect(determineEdges(rect(0, 0), rect(400, 0), [rect(200, 0)])).toEqual({ exitEdge: 'bottom', entryEdge: 'bottom' })
  })

  it('connects stacked cards through top and bottom', () => {
    expect(determineEdges(rect(0, 0), rect(0, 200), [])).toEqual({ exitEdge: 'bottom', entryEdge: 'top' })
    expect(determineEdges(rect(0, 200), rect(0, 0), [])).toEqual({ exitEdge: 'top', entryEdge: 'bottom' })
  })
})

describe('bezierMid', () => {
  it('is the middle of a straight curve', () => {
    expect(bezierMid({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 })).toEqual({ x: 15, y: 0 })
  })
})

describe('routeArrows', () => {
  it('draws from edge to edge, relative to the container', () => {
    const rects = new Map([['a', rect(100, 100)], ['b', rect(300, 100)]])
    const [arrow] = routeArrows([{ key: 'a|b', fromId: 'a', toId: 'b' }], rects, rect(100, 100, 800, 800))
    expect(arrow!.key).toBe('a|b')
    expect(arrow!.d).toMatch(/^M 100 30 C .* 200 30$/)
    expect(arrow!.mid).toEqual({ x: 150, y: 30 })
  })

  it('skips arrows whose cards are not on screen', () => {
    const rects = new Map([['a', rect(0, 0)]])
    expect(routeArrows([{ key: 'a|x', fromId: 'a', toId: 'x' }], rects, container)).toEqual([])
  })

  it('spreads arrows that share a card edge', () => {
    // a → b and a → c both leave a through its right edge
    const [ab, ac] = routeArrows(
      [{ key: 'a|b', fromId: 'a', toId: 'b' }, { key: 'a|c', fromId: 'a', toId: 'c' }],
      new Map([['a', rect(0, 0)], ['b', rect(200, 0)], ['c', rect(200, 10)]]),
      container,
    )
    const startY = (d: string) => Number(d.split(' ')[2])
    expect(startY(ab!.d)).not.toBe(startY(ac!.d))
  })
})
