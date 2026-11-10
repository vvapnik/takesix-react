export function PlusIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function ArrowRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

/** Lines of text: a block that opens into text, beside the dots of one with blocks */
export function TextIcon() {
  return (
    <svg width="11" height="11" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="5" y1="6" x2="19" y2="6" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="18" x2="13" y2="18" />
    </svg>
  )
}

/** The TakeSix logo; draws with the text colour */
export function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-1.5 2 35 35" fill="currentColor" aria-hidden="true">
      <rect x="3.6" y="9" width="3.6" height="12" rx="1.8" />
      <rect x="7.9" y="5" width="3.6" height="16" rx="1.8" />
      <rect x="12.2" y="3" width="3.6" height="18" rx="1.8" />
      <rect x="16.5" y="4" width="3.6" height="17" rx="1.8" />
      <rect x="20.8" y="7" width="3.6" height="14" rx="1.8" />
      <path d="M3.6 18.6L7.55 17.6L11.85 15.4L16.15 14.6L20.45 15.3L24.4 16.6V29.5C24.4 33.3 21.4 36 17.6 36H10.6C6.7 36 3.6 33 3.6 29.1Z" />
      <line x1="21.5" y1="31" x2="28.4" y2="19.6" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * A block's icon: an emoji or character as text, or an inline SVG drawing
 * shown as an image (a data URL: scripts in it never run).
 */
export function BlockIcon({ icon, className }: { icon: string; className?: string }) {
  const text = icon.trim()
  if (!text.startsWith('<svg')) return <span className={className}>{icon}</span>
  const svg = /\sxmlns=/.test(text.slice(0, text.indexOf('>'))) ? text : text.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  return <img className={className} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="" draggable={false} />
}

/** Two chain links: copy a link */
export function LinkIcon() {
  return (
    <svg width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg width="12" height="12" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 12 10 17 19 7" />
    </svg>
  )
}
