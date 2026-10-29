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
}

export interface ArrowPath {
  key: string
  /** SVG path data, relative to the container. */
  d: string
  /** Middle of the curve, for the label. */
  mid: Point
}

// Distribute N connection points symmetrically around the center of an edge
function slotPos(idx: number, total: number, edgeLen: number): number {
  if (total <= 1) return 0
  const spacing = Math.min(16, edgeLen * 0.6 / total)
  return (idx - (total - 1) / 2) * spacing
}

export function determineEdges(
  fromRect: Rect,
  toRect: Rect,
  obstacleRects: Rect[],
): { exitEdge: Edge; entryEdge: Edge } {
  const fromCX = (fromRect.left + fromRect.right) / 2
  const fromCY = (fromRect.top + fromRect.bottom) / 2
  const toCX = (toRect.left + toRect.right) / 2
  const toCY = (toRect.top + toRect.bottom) / 2
  const dx = toCX - fromCX
  const dy = toCY - fromCY

  const sameRow = Math.abs(dy) < Math.min(fromRect.height, toRect.height) * 0.5
  if (sameRow) {
    const goRight = dx >= 0
    const blocked = obstacleRects.some(r => {
      const rCX = (r.left + r.right) / 2
      const inX = goRight
        ? rCX > fromRect.right - 4 && rCX < toRect.left + 4
        : rCX < fromRect.left + 4 && rCX > toRect.right - 4
      const inY = Math.abs((r.top + r.bottom) / 2 - fromCY) < (fromRect.height + r.height) * 0.4
      return inX && inY
    })
    if (!blocked) {
      return { exitEdge: goRight ? 'right' : 'left', entryEdge: goRight ? 'left' : 'right' }
    }
    return { exitEdge: 'bottom', entryEdge: 'bottom' }
  }

  const goDown = dy > 0
  return { exitEdge: goDown ? 'bottom' : 'top', entryEdge: goDown ? 'top' : 'bottom' }
}

export function edgePoint(rect: Rect, edge: Edge, idx: number, total: number, origin: Point): Point {
  const cx = (rect.left + rect.right) / 2
  const cy = (rect.top + rect.bottom) / 2
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

  const fromEdgeY = exitEdge === 'bottom' ? fromRect.bottom : fromRect.top
  const toEdgeY = entryEdge === 'top' ? toRect.top : toRect.bottom
  const midY = (fromEdgeY + toEdgeY) / 2 - origin.y
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

  interface Conn {
    key: string
    fromId: string
    toId: string
    fromRect: Rect
    toRect: Rect
    exitEdge: Edge
    entryEdge: Edge
  }
  const conns: Conn[] = []
  for (const { key, fromId, toId } of requests) {
    const fromRect = rects.get(fromId)
    const toRect = rects.get(toId)
    if (!fromRect || !toRect) continue
    const obstacles: Rect[] = []
    for (const [id, r] of rects) if (id !== fromId && id !== toId) obstacles.push(r)
    conns.push({ key, fromId, toId, fromRect, toRect, ...determineEdges(fromRect, toRect, obstacles) })
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
    const p1 = edgePoint(c.fromRect, c.exitEdge, exitIdx, exitPool.length, origin)
    const p2 = edgePoint(c.toRect, c.entryEdge, entryIdx, entryPool.length, origin)
    const [c1, c2] = controlPoints(c.fromRect, c.toRect, origin, c.exitEdge, c.entryEdge, p1, p2)
    return {
      key: c.key,
      d: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
      mid: bezierMid(p1, c1, c2, p2),
    }
  })
}
