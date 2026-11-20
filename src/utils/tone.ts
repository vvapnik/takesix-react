import { BLOCK_TONES, TONE_COLOR_PATTERN, type BlockTone, type BlockToneName } from '@takesix/core'

/** Names of the tones: tooltips, screen readers and the menu's caption. */
export const TONE_NAMES: Record<BlockToneName, string> = {
  neutral: 'Neutral',
  accent: 'Accent',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
}

/**
 * The CSS colour a block's tone stands for: a theme token for a name, the
 * colour itself for a hex value. Undefined for neutral and for values this
 * viewer does not know, which are drawn neutral (FORMAT.md, Tone).
 */
export function toneColor(tone: BlockTone | undefined): string | undefined {
  if (!tone || tone === 'neutral') return undefined
  if (tone.startsWith('#')) return TONE_COLOR_PATTERN.test(tone) ? tone : undefined
  return (BLOCK_TONES as readonly string[]).includes(tone) ? `var(--ts-tone-${tone})` : undefined
}

/** A known tone name, or undefined for a colour of the block's own. */
export function toneName(tone: BlockTone | undefined): BlockToneName | undefined {
  if (!tone) return 'neutral'
  return (BLOCK_TONES as readonly string[]).includes(tone) ? (tone as BlockToneName) : undefined
}

/** `#RGB` as `#RRGGBB`, the form a colour input takes. */
export function longHex(color: string): string {
  return color.length === 4 ? `#${[...color.slice(1)].map(c => c + c).join('')}` : color
}
