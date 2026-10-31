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
    expect(arrow!.vertical).toBe(false)
  })

  it('marks arrows between stacked cards as vertical', () => {
    const rects = new Map([['a', rect(0, 0)], ['b', rect(0, 100)]])
    const [down] = routeArrows([{ key: 'a|b', fromId: 'a', toId: 'b' }], rects, container)
    expect(down!.vertical).toBe(true)
    // an arc around a card in between is not vertical
    const around = new Map([['a', rect(0, 0)], ['m', rect(200, 0)], ['b', rect(400, 0)]])
    const [arc] = routeArrows([{ key: 'a|b', fromId: 'a', toId: 'b' }], around, container)
    expect(arc!.vertical).toBe(false)
  })

  it('ends at the base of an arrowhead, which stops short of the card', () => {
    // 200 (card edge) - 4 (gap) - 10 (head length) = 186
    const rects = new Map([['a', rect(100, 100)], ['b', rect(300, 100)]])
    const box = rect(100, 100, 800, 800)
    const [end] = routeArrows([{ key: 'a|b', fromId: 'a', toId: 'b', headAtEnd: true }], rects, box)
    expect(end!.d).toMatch(/^M 100 30 C .* 186 30$/)
    const [both] = routeArrows([{ key: 'a|b', fromId: 'a', toId: 'b', headAtStart: true, headAtEnd: true }], rects, box)
    expect(both!.d).toMatch(/^M 114 30 C .* 186 30$/)
  })

  it('shrinks the head offsets to fit a narrow gap instead of running backwards', () => {
    // rows 12px apart: the path must still go down, from y=60 towards y=72
    const rects = new Map([['a', rect(0, 0)], ['b', rect(0, 72)]])
    const [arrow] = routeArrows([{ key: 'a|b', fromId: 'a', toId: 'b', headAtEnd: true }], rects, container)
    const nums = arrow!.d.split(/[ ,]+/).filter(Boolean).filter(t => !/[A-Z]/.test(t)).map(Number)
    const startY = nums[1]!, endY = nums[nums.length - 1]!
    expect(startY).toBe(60)
    expect(endY).toBeGreaterThan(startY)
    expect(endY).toBeLessThanOrEqual(72)
    // the curve must arrive going down: its last control point is above the end
    const lastControlY = nums[nums.length - 3]!
    expect(lastControlY).toBeLessThanOrEqual(endY)
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
