import { describe, expect, it } from 'vitest'
import { bezierMid, determineEdges, IO_SKEW, routeArrows, type Rect } from '../src/geometry.js'

function rect(left: number, top: number, width = 100, height = 60): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

const container = rect(0, 0, 1000, 1000)

describe('determineEdges', () => {
  it('connects side by side cards through facing edges', () => {
    expect(determineEdges(rect(0, 0), rect(200, 0), [])).toEqual({ exitEdge: 'right', entryEdge: 'left', anchor: 30 })
    expect(determineEdges(rect(200, 0), rect(0, 0), [])).toEqual({ exitEdge: 'left', entryEdge: 'right', anchor: 30 })
  })

  it('runs straight across the rows a tall card shares with a short one', () => {
    // tall card spans two rows (0–140), the short one sits in the second (80–140)
    expect(determineEdges(rect(200, 80), rect(0, 0, 100, 140), [])).toEqual({ exitEdge: 'left', entryEdge: 'right', anchor: 110 })
  })

  it('runs straight down through the columns two cards share', () => {
    // a wide card above a narrower one on its right half
    expect(determineEdges(rect(0, 0, 400), rect(300, 200, 200), [])).toEqual({ exitEdge: 'bottom', entryEdge: 'top', anchor: 350 })
  })

  it('goes around a card standing in between', () => {
    // below the cards of a row
    expect(determineEdges(rect(0, 0), rect(400, 0), [rect(200, 0)])).toEqual({ exitEdge: 'bottom', entryEdge: 'bottom', lane: 80 })
    // beside the cards of a column: the way back of a loop, past a body that
    // sticks out on the right, so the left is shorter
    expect(determineEdges(rect(100, 200), rect(100, 0), [rect(100, 100, 150)]))
      .toEqual({ exitEdge: 'left', entryEdge: 'left', lane: 80 })
    // on the side with no other card in the way
    expect(determineEdges(rect(100, 200), rect(100, 0), [rect(100, 100), rect(-50, 0, 100, 260)]))
      .toEqual({ exitEdge: 'right', entryEdge: 'right', lane: 220 })
  })

  it('connects stacked cards through top and bottom', () => {
    expect(determineEdges(rect(0, 0), rect(0, 200), [])).toEqual({ exitEdge: 'bottom', entryEdge: 'top', anchor: 50 })
    expect(determineEdges(rect(0, 200), rect(0, 0), [])).toEqual({ exitEdge: 'top', entryEdge: 'bottom', anchor: 50 })
    // neither rows nor columns shared: side to side, like a branch of a tree
    expect(determineEdges(rect(0, 200), rect(300, 0), [])).toEqual({ exitEdge: 'right', entryEdge: 'left' })
    expect(determineEdges(rect(300, 0), rect(0, 200), [])).toEqual({ exitEdge: 'left', entryEdge: 'right' })
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

describe('routeArrows (shapes and detours)', () => {
  it('reaches a diamond at its corners and a parallelogram at its slanted side', () => {
    const rects = new Map([['q', rect(0, 0, 200, 60)], ['a', rect(400, 20, 100, 100)], ['b', rect(0, 200, 400, 60)]])
    const shapes = new Map([['q', 'decision' as const], ['a', 'io' as const]])
    const [right, down] = routeArrows(
      [{ key: 'q|a', fromId: 'q', toId: 'a' }, { key: 'q|b', fromId: 'q', toId: 'b' }], rects, container, shapes)
    // out of the right corner, at the diamond's middle height, not the shared rows
    expect(right!.d.startsWith('M 200 30 ')).toBe(true)
    expect(right!.d.endsWith(` ${400 + IO_SKEW / 2} 30`)).toBe(true)
    // out of the bottom corner
    expect(down!.d.startsWith('M 100 60 ')).toBe(true)
  })

  it('draws a detour as straight lines with rounded corners', () => {
    const rects = new Map([['end', rect(100, 200)], ['start', rect(100, 0)], ['body', rect(50, 100, 200)], ['side', rect(-50, 0, 100, 60)]])
    const [arrow] = routeArrows([{ key: 'end|start', fromId: 'end', toId: 'start', headAtEnd: true }], rects, container)
    expect(arrow!.d).toMatch(/^M 200 230 L 260 230 Q 270 230 270 220 L 270 40 Q 270 30 260 30 L 214 30$/)
    expect(arrow!.mid).toEqual({ x: 270, y: 130 })
    expect(arrow!.vertical).toBe(true)
  })
})
