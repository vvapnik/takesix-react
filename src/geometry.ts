// Arrow routing between cards. Pure functions over rects, so they can be
// tested without a browser layout engine.

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export type Edge = 'left' | 'right' | 'top' | 'bottom'

export interface ArrowRequest {
  key: string
  fromId: string
  toId: string
  /** An arrowhead is drawn at this end: the path stops at the head's base, short of the card. */
  headAtStart?: boolean
  headAtEnd?: boolean
}

/** Space between an arrowhead's tip and the card it points at. */
export const HEAD_GAP = 4

/** Length of the arrowhead. The path ends at its base and the head is drawn
    beyond it, so the line never shows through the tip. */
export const HEAD_LENGTH = 10

/** Shortest visible line left between two arrowheads. */
const MIN_LINE = 2

/** Distance between two facing edges (right → left, bottom → top…), or null if they do not face each other. */
function facingGap(exit: Edge, entry: Edge, p1: Point, p2: Point): number | null {
  if (exit === 'right' && entry === 'left') return p2.x - p1.x
  if (exit === 'left' && entry === 'right') return p1.x - p2.x
  if (exit === 'bottom' && entry === 'top') return p2.y - p1.y
  if (exit === 'top' && entry === 'bottom') return p1.y - p2.y
  return null
}

/** Moves a point on a card edge away from the card, along the edge's outward normal. */
function away(p: Point, edge: Edge, distance: number): Point {
  switch (edge) {
    case 'right':  return { x: p.x + distance, y: p.y }
    case 'left':   return { x: p.x - distance, y: p.y }
    case 'bottom': return { x: p.x, y: p.y + distance }
    case 'top':    return { x: p.x, y: p.y - distance }
  }
}

export interface ArrowPath {
  key: string
  /** SVG path data, relative to the container. */
  d: string
  /** Middle of the curve, for the label. */
  mid: Point
  /** Runs from one card's top/bottom edge to the other's: put the label beside it, not on it. */
  vertical: boolean
}

// Distribute N connection points symmetrically around the center of an edge
function slotPos(idx: number, total: number, edgeLen: number): number {
  if (total <= 1) return 0
  const spacing = Math.min(16, edgeLen * 0.6 / total)
  return (idx - (total - 1) / 2) * spacing
}

/** How an arrow leaves one card and enters the other. */
export interface Edges {
  exitEdge: Edge
  entryEdge: Edge
  /**
   * Where along the edges the arrow attaches (x for top/bottom, y for
   * left/right), shared by both ends so the arrow runs straight. Absent:
   * the middle of each edge.
   */
  anchor?: number
}

/** Length of the part two ranges share, and its middle. */
function shared(a1: number, a2: number, b1: number, b2: number): { length: number; middle: number } {
  const start = Math.max(a1, b1)
  const end = Math.min(a2, b2)
  return { length: end - start, middle: (start + end) / 2 }
}

/**
 * Cards that share part of their height (side by side, or a tall card next to
 * a short one) connect straight across the shared part; cards that share part
 * of their width, straight up or down. Otherwise the arrow bends from the
 * side of one card to the facing side of the other.
 */
export function determineEdges(fromRect: Rect, toRect: Rect, obstacleRects: Rect[]): Edges {
  const fromCX = (fromRect.left + fromRect.right) / 2
  const toCX = (toRect.left + toRect.right) / 2
  const fromCY = (fromRect.top + fromRect.bottom) / 2
  const toCY = (toRect.top + toRect.bottom) / 2

  const rows = shared(fromRect.top, fromRect.bottom, toRect.top, toRect.bottom)
  if (rows.length >= Math.min(fromRect.height, toRect.height) * 0.5) {
    const goRight = toCX >= fromCX
    const left = goRight ? fromRect.right : toRect.right
    const right = goRight ? toRect.left : fromRect.left
    // A card standing in the way of the straight line: arc below instead
    const blocked = obstacleRects.some(r =>
      r.left < right - 4 && r.right > left + 4 && r.top < rows.middle && r.bottom > rows.middle)
    if (!blocked) {
      return { exitEdge: goRight ? 'right' : 'left', entryEdge: goRight ? 'left' : 'right', anchor: rows.middle }
    }
    return { exitEdge: 'bottom', entryEdge: 'bottom' }
  }

  const cols = shared(fromRect.left, fromRect.right, toRect.left, toRect.right)
  if (cols.length <= 0) {
    // Diagonal neighbours (a branch of a tree): side to side, so the diagram
    // reads left to right
    const goRight = toCX >= fromCX
    return { exitEdge: goRight ? 'right' : 'left', entryEdge: goRight ? 'left' : 'right' }
  }
  const goDown = toCY > fromCY
  return { exitEdge: goDown ? 'bottom' : 'top', entryEdge: goDown ? 'top' : 'bottom', anchor: cols.middle }
}

/** A point on a card edge: at `anchor` (or the edge's middle), moved by its slot. */
export function edgePoint(rect: Rect, edge: Edge, idx: number, total: number, origin: Point, anchor?: number): Point {
  const cx = anchor ?? (rect.left + rect.right) / 2
  const cy = anchor ?? (rect.top + rect.bottom) / 2
  switch (edge) {
    case 'right':  return { x: rect.right - origin.x, y: cy - origin.y + slotPos(idx, total, rect.height) }
    case 'left':   return { x: rect.left - origin.x,  y: cy - origin.y + slotPos(idx, total, rect.height) }
    case 'bottom': return { x: cx - origin.x + slotPos(idx, total, rect.width), y: rect.bottom - origin.y }
    case 'top':    return { x: cx - origin.x + slotPos(idx, total, rect.width), y: rect.top - origin.y }
  }
}

/** Cubic Bézier control points from `p1` (on `exitEdge`) to `p2` (on `entryEdge`). */
export function controlPoints(
  fromRect: Rect,
  toRect: Rect,
  origin: Point,
  exitEdge: Edge,
  entryEdge: Edge,
  p1: Point,
  p2: Point,
): [Point, Point] {
  if (exitEdge === 'bottom' && entryEdge === 'bottom') {
    const arcY = Math.max(p1.y, p2.y) + 32
    return [{ x: p1.x, y: arcY }, { x: p2.x, y: arcY }]
  }

  if (exitEdge === 'right' || exitEdge === 'left') {
    const toCX = (toRect.left + toRect.right) / 2
    const fromCX = (fromRect.left + fromRect.right) / 2
    const s = exitEdge === 'right' ? 1 : -1
    const offset = Math.min(Math.abs(toCX - fromCX) * 0.4, 80)
    return [{ x: p1.x + s * offset, y: p1.y }, { x: p2.x - s * offset, y: p2.y }]
  }

  // Between the path's own ends, not the card edges: the ends may be pulled
  // back for arrowheads, and a control point beyond an end turns the head around.
  const midY = (p1.y + p2.y) / 2
  return [{ x: p1.x, y: midY }, { x: p2.x, y: midY }]
}

/** Point of a cubic Bézier at t = 0.5. */
export function bezierMid(p0: Point, c1: Point, c2: Point, p3: Point): Point {
  return {
    x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
    y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8,
  }
}

/**
 * Routes all arrows of one screen. Exits and entries on the same edge of the
 * same card share one pool of slots, so arrows never start or end on top of
 * each other. Arrows whose cards have no rect are skipped.
 */
export function routeArrows(requests: ArrowRequest[], rects: Map<string, Rect>, container: Rect): ArrowPath[] {
  const origin = { x: container.left, y: container.top }

  interface Conn extends ArrowRequest, Edges {
    fromRect: Rect
    toRect: Rect
  }
  const conns: Conn[] = []
  for (const request of requests) {
    const { fromId, toId } = request
    const fromRect = rects.get(fromId)
    const toRect = rects.get(toId)
    if (!fromRect || !toRect) continue
    const obstacles: Rect[] = []
    for (const [id, r] of rects) if (id !== fromId && id !== toId) obstacles.push(r)
    conns.push({ ...request, fromRect, toRect, ...determineEdges(fromRect, toRect, obstacles) })
  }

  const pools = new Map<string, Array<{ ci: number; role: 'exit' | 'entry' }>>()
  const join = (k: string, ci: number, role: 'exit' | 'entry') => {
    let pool = pools.get(k)
    if (!pool) pools.set(k, (pool = []))
    pool.push({ ci, role })
  }
  conns.forEach((c, ci) => {
    join(`${c.fromId}-${c.exitEdge}`, ci, 'exit')
    join(`${c.toId}-${c.entryEdge}`, ci, 'entry')
  })

  return conns.map((c, ci) => {
    const exitPool = pools.get(`${c.fromId}-${c.exitEdge}`)!
    const entryPool = pools.get(`${c.toId}-${c.entryEdge}`)!
    const exitIdx = exitPool.findIndex(s => s.ci === ci && s.role === 'exit')
    const entryIdx = entryPool.findIndex(s => s.ci === ci && s.role === 'entry')
    const e1 = edgePoint(c.fromRect, c.exitEdge, exitIdx, exitPool.length, origin, c.anchor)
    const e2 = edgePoint(c.toRect, c.entryEdge, entryIdx, entryPool.length, origin, c.anchor)
    let startOffset = c.headAtStart ? HEAD_GAP + HEAD_LENGTH : 0
    let endOffset = c.headAtEnd ? HEAD_GAP + HEAD_LENGTH : 0
    // Facing edges with a narrow gap between them (tight list rows): shrink the
    // offsets to fit, or the path would run backwards and flip the heads.
    const facing = facingGap(c.exitEdge, c.entryEdge, e1, e2)
    if (facing !== null && startOffset + endOffset > facing - MIN_LINE) {
      const k = Math.max(0, facing - MIN_LINE) / (startOffset + endOffset)
      startOffset *= k
      endOffset *= k
    }
    const p1 = away(e1, c.exitEdge, startOffset)
    const p2 = away(e2, c.entryEdge, endOffset)
    const [c1, c2] = controlPoints(c.fromRect, c.toRect, origin, c.exitEdge, c.entryEdge, p1, p2)
    return {
      key: c.key,
      d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
      mid: bezierMid(p1, c1, c2, p2),
      vertical: (c.exitEdge === 'top' && c.entryEdge === 'bottom') || (c.exitEdge === 'bottom' && c.entryEdge === 'top'),
    }
  })
}
