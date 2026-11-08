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

/** Outline of a card, where it differs from a rectangle for arrows. */
export type CardShape = 'decision' | 'io'

/** How far the slanted sides of an `io` card lean (CSS: --ts-io-skew). */
export const IO_SKEW = 14

/** Distance between a detour around blocks and the outermost of them. */
export const DETOUR_GAP = 20

/** Radius of the corners of a detour. */
const DETOUR_RADIUS = 10

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
  /** A detour on the left: its label goes outside, to the left, when there is room. */
  detourLeft?: boolean
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
  /**
   * A straight arrow with cards in its way goes around them along this line:
   * x of a column beside them (left/right edges), or y of a row below them
   * (bottom edges). Absent: no detour.
   */
  lane?: number
}

/** Whether an axis-aligned segment passes through the inside of a rect. */
function hits(r: Rect, x1: number, y1: number, x2: number, y2: number): boolean {
  const e = 2
  return Math.max(x1, x2) > r.left + e && Math.min(x1, x2) < r.right - e &&
    Math.max(y1, y2) > r.top + e && Math.min(y1, y2) < r.bottom - e
}

/** Cards that overlap the band between two ranges on one axis, the line at `at` on the other. */
function blockingRects(obstacles: Rect[], vertical: boolean, at: number, from: number, to: number): Rect[] {
  const [a, b] = from < to ? [from, to] : [to, from]
  return obstacles.filter(r => vertical ? hits(r, at, a, at, b) : hits(r, a, at, b, at))
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
export function determineEdges(fromRect: Rect, toRect: Rect, obstacleRects: Rect[], bounds?: Rect): Edges {
  const fromCX = (fromRect.left + fromRect.right) / 2
  const toCX = (toRect.left + toRect.right) / 2
  const fromCY = (fromRect.top + fromRect.bottom) / 2
  const toCY = (toRect.top + toRect.bottom) / 2

  const rows = shared(fromRect.top, fromRect.bottom, toRect.top, toRect.bottom)
  if (rows.length >= Math.min(fromRect.height, toRect.height) * 0.5) {
    const goRight = toCX >= fromCX
    const left = goRight ? fromRect.right : toRect.right
    const right = goRight ? toRect.left : fromRect.left
    // A card standing in the way of the straight line: go around below the cards
    const blocking = blockingRects(obstacleRects, false, rows.middle, left, right)
    if (!blocking.length) {
      return { exitEdge: goRight ? 'right' : 'left', entryEdge: goRight ? 'left' : 'right', anchor: rows.middle }
    }
    const lane = Math.max(fromRect.bottom, toRect.bottom, ...blocking.map(r => r.bottom)) + DETOUR_GAP
    return { exitEdge: 'bottom', entryEdge: 'bottom', lane }
  }

  const cols = shared(fromRect.left, fromRect.right, toRect.left, toRect.right)
  if (cols.length <= 0) {
    // Diagonal neighbours (a branch of a tree): side to side, so the diagram
    // reads left to right
    const goRight = toCX >= fromCX
    return { exitEdge: goRight ? 'right' : 'left', entryEdge: goRight ? 'left' : 'right' }
  }
  const goDown = toCY > fromCY
  const top = goDown ? fromRect.bottom : toRect.bottom
  const bottom = goDown ? toRect.top : fromRect.top
  const blocking = blockingRects(obstacleRects, true, cols.middle, top, bottom)
  if (!blocking.length) {
    return { exitEdge: goDown ? 'bottom' : 'top', entryEdge: goDown ? 'top' : 'bottom', anchor: cols.middle }
  }
  // Cards in the way (the way back of a loop, say): around them on the side
  // that crosses fewer other cards, then the one that stays inside the
  // level's area, then the one with fewer cards beside it, then the shorter one
  const boxes = [fromRect, toRect, ...blocking]
  const sides = (['right', 'left'] as const).map(edge => {
    const lane = edge === 'right'
      ? Math.max(...boxes.map(r => r.right)) + DETOUR_GAP
      : Math.min(...boxes.map(r => r.left)) - DETOUR_GAP
    const fromX = edge === 'right' ? fromRect.right : fromRect.left
    const toX = edge === 'right' ? toRect.right : toRect.left
    const crossed = obstacleRects.filter(r =>
      hits(r, fromX, fromCY, lane, fromCY) || hits(r, lane, fromCY, lane, toCY) || hits(r, toX, toCY, lane, toCY)).length
    const length = Math.abs(lane - fromX) + Math.abs(lane - toX)
    // Cards beside the detour's rows on that side: their arrows are likely in the way
    const top = Math.min(...boxes.map(r => r.top))
    const bottom = Math.max(...boxes.map(r => r.bottom))
    const beside = obstacleRects.filter(r => r.top < bottom && r.bottom > top &&
      (edge === 'right' ? r.left >= lane - DETOUR_GAP : r.right <= lane + DETOUR_GAP)).length
    // Outside the level's area the line would be cut off
    const outside = bounds !== undefined && (lane < bounds.left || lane > bounds.right) ? 1 : 0
    return { edge, lane, score: crossed * 1000000 + outside * 100000 + beside * 10000 + length }
  })
  const best = sides[1]!.score < sides[0]!.score ? sides[1]! : sides[0]!
  return { exitEdge: best.edge, entryEdge: best.edge, lane: best.lane }
}

/**
 * SVG path of a detour from `p1` to `p2` along `lane`, with rounded corners:
 * out to the lane, along it, back in.
 */
function detourPath(p1: Point, p2: Point, lane: number, alongX: boolean): { d: string; mid: Point } {
  const c1 = alongX ? { x: lane, y: p1.y } : { x: p1.x, y: lane }
  const c2 = alongX ? { x: lane, y: p2.y } : { x: p2.x, y: lane }
  const len = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
  const r = Math.max(0, Math.min(DETOUR_RADIUS, len(p1, c1), len(c1, c2) / 2, len(c2, p2)))
  // A point `d` from `a` towards `b`
  const toward = (a: Point, b: Point, d: number): Point => {
    const l = len(a, b) || 1
    return { x: a.x + ((b.x - a.x) / l) * d, y: a.y + ((b.y - a.y) / l) * d }
  }
  const a1 = toward(c1, p1, r)
  const b1 = toward(c1, c2, r)
  const a2 = toward(c2, c1, r)
  const b2 = toward(c2, p2, r)
  return {
    d: `M ${p1.x} ${p1.y} L ${a1.x} ${a1.y} Q ${c1.x} ${c1.y} ${b1.x} ${b1.y} ` +
      `L ${a2.x} ${a2.y} Q ${c2.x} ${c2.y} ${b2.x} ${b2.y} L ${p2.x} ${p2.y}`,
    mid: { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 },
  }
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
export function routeArrows(
  requests: ArrowRequest[],
  rects: Map<string, Rect>,
  container: Rect,
  shapes: Map<string, CardShape> = new Map(),
): ArrowPath[] {
  const origin = { x: container.left, y: container.top }
  // A diamond is reached at its corners, the middle of each edge; the slanted
  // sides of a parallelogram cross the middle of the card's height inset by
  // half their lean.
  const attach = (id: string, rect: Rect, edge: Edge, idx: number, total: number, anchor?: number): Point => {
    const shape = shapes.get(id)
    if (shape === 'decision') return edgePoint(rect, edge, 0, 1, origin)
    const p = edgePoint(rect, edge, idx, total, origin, anchor)
    if (shape === 'io' && edge === 'left') return { x: p.x + IO_SKEW / 2, y: p.y }
    if (shape === 'io' && edge === 'right') return { x: p.x - IO_SKEW / 2, y: p.y }
    return p
  }

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
    const edges = determineEdges(fromRect, toRect, obstacles, container)
    // A straight arrow to or from a diamond runs through its corner, when the
    // other card reaches that far
    if (edges.anchor !== undefined) {
      const across = edges.exitEdge === 'left' || edges.exitEdge === 'right'
      const center = (r: Rect) => (across ? (r.top + r.bottom) / 2 : (r.left + r.right) / 2)
      const within = (v: number, r: Rect) => (across ? v > r.top && v < r.bottom : v > r.left && v < r.right)
      if (shapes.get(fromId) === 'decision' && within(center(fromRect), toRect)) edges.anchor = center(fromRect)
      else if (shapes.get(toId) === 'decision' && within(center(toRect), fromRect)) edges.anchor = center(toRect)
    }
    conns.push({ ...request, fromRect, toRect, ...edges })
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
    const e1 = attach(c.fromId, c.fromRect, c.exitEdge, exitIdx, exitPool.length, c.anchor)
    const e2 = attach(c.toId, c.toRect, c.entryEdge, entryIdx, entryPool.length, c.anchor)
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
    if (c.lane !== undefined) {
      const alongX = c.exitEdge === 'left' || c.exitEdge === 'right'
      const lane = c.lane - (alongX ? origin.x : origin.y)
      const { d, mid } = detourPath(p1, p2, lane, alongX)
      return { key: c.key, d, mid, vertical: alongX, ...(c.exitEdge === 'left' ? { detourLeft: true } : {}) }
    }
    const [c1, c2] = controlPoints(c.fromRect, c.toRect, origin, c.exitEdge, c.entryEdge, p1, p2)
    return {
      key: c.key,
      d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
      mid: bezierMid(p1, c1, c2, p2),
      vertical: (c.exitEdge === 'top' && c.entryEdge === 'bottom') || (c.exitEdge === 'bottom' && c.entryEdge === 'top'),
    }
  })
}
