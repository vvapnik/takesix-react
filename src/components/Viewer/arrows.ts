import type { VisibleLink } from '@takesix/core'
import { HEAD_LENGTH, HEAD_SWEEP, HEAD_WIDTH, type ArrowPath, type Rect } from '../../utils/geometry.js'

/** A routed arrow with the links it stands for. */
export interface Arrow extends ArrowPath {
  link: VisibleLink
  label?: string
}

/** A straight arrow across less space than this joins neighbouring blocks
    (no free cell between them): it is drawn without its label. */
const NEIGHBOUR_GAP = 48

/** Space between a vertical arrow and its label. */
const LABEL_GAP = 8

/** Rough width of a label character (11px, medium weight). */
const LABEL_CHAR = 6.5

/** Horizontal padding of a label's pill, on both sides together. */
const LABEL_PAD = 14

/**
 * The TakeSix arrowhead: a dart whose barbs sweep back along the line, with
 * a notch between them. The tip is where the path's head ends (HEAD_LENGTH
 * past its end); the notch reaches just past the end, so no gap shows.
 */
export const HEAD_PATH = `M ${-HEAD_SWEEP} 0 L ${HEAD_LENGTH} ${HEAD_WIDTH / 2} L ${-HEAD_SWEEP} ${HEAD_WIDTH} L 0.5 ${HEAD_WIDTH / 2} Z`

/** Marker attributes for HEAD_PATH: the line's end at x 0 (the notch). */
export const HEAD_MARKER = {
  viewBox: `${-HEAD_SWEEP - 1} -1 ${HEAD_LENGTH + HEAD_SWEEP + 2} ${HEAD_WIDTH + 2}`,
  markerWidth: HEAD_LENGTH + HEAD_SWEEP + 2,
  markerHeight: HEAD_WIDTH + 2,
  refX: 0,
  refY: HEAD_WIDTH / 2,
  orient: 'auto-start-reverse',
  markerUnits: 'userSpaceOnUse',
} as const

function arrowLabel(link: VisibleLink): string | undefined {
  const labels = [...new Set(link.links.map(l => l.label).filter((l): l is string => !!l))]
  if (link.links.length > 2) return `${link.links.length} links`
  return labels.length ? labels.join(', ') : undefined
}

/** Same for a→b and b→a, so reversing a link keeps its editor open. */
export function pairKey(link: VisibleLink): string {
  return [link.from, link.to].sort().join('|')
}

export function toRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}

/** Joins routed paths with their links and labels. */
export function toArrows(paths: ArrowPath[], links: VisibleLink[]): Arrow[] {
  const byKey = new Map(links.map(l => [l.key, l]))
  return paths.flatMap(p => {
    const link = byKey.get(p.key)
    if (!link) return []
    // Neighbours (no free cell between them, or one shrunk away on a narrow
    // level): the short arrow has no room for its label
    const label = arrowLabel(link)
    const roomy = p.span === undefined || p.span >= NEIGHBOUR_GAP
    return [{ ...p, link, label: roomy ? label : undefined }]
  })
}

/**
 * Where an arrow's label pill goes. Vertical arrows often cross a narrow gap
 * between rows: label beside the arrow. A detour on the left has the cards on
 * its right: label outside it, or on the line itself when the level's edge is
 * too close.
 */
export function labelPlacement(a: Arrow & { label: string }): { x: number; shift: string } {
  const room = a.mid.x - LABEL_GAP
  const anchor = !a.vertical ? 'middle'
    : !a.detourLeft ? 'start'
    : room >= a.label.length * LABEL_CHAR + LABEL_PAD ? 'end' : 'middle'
  const x = anchor === 'start' ? a.mid.x + LABEL_GAP : anchor === 'end' ? a.mid.x - LABEL_GAP : a.mid.x
  const shift = anchor === 'start' ? '0' : anchor === 'end' ? '-100%' : '-50%'
  return { x, shift }
}
