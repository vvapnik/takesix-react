import { formatViewAddress, type ViewAddress } from '@takesix/core'

// Links to screens of a diagram: the page's own URL with the screen's address
// in the fragment (`#in=<id>` / `#at=<id>`, see FORMAT.md), next to whatever
// else the fragment holds (`takesix=<data>` in the editor).

/** Link to a screen on the current page. */
export function screenLink(view: ViewAddress, href = window.location.href): string {
  const [base, hash = ''] = href.split('#') as [string, string?]
  return base + formatViewAddress(view, hash)
}

/**
 * Copies text to the clipboard; resolves to whether it worked. Falls back to
 * a hidden text field where the Clipboard API is missing or refused.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    Object.assign(field.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' })
    document.body.appendChild(field)
    field.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      field.remove()
    }
  }
}
