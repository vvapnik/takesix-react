import { useEffect, useId, useRef, useState } from 'react'
import { serializeDocument, type TakeSixDocument } from '@takesix/core'
import { LogoIcon } from './icons.js'
import { createEditorLink, DEFAULT_EDITOR_URL } from './share.js'
import styles from './Menu.module.css'

/** A file the menu wants saved. */
export interface MenuFile {
  name: string
  mimeType: string
  text: string
}

/** Options for the floating TakeSix menu (the `menu` prop). */
export interface MenuOptions {
  /** Editor that "Open in editor" links to. Default: the TakeSix online editor. */
  editorUrl?: string
  /**
   * The page to save with "Save as HTML", as a whole HTML document. Without it
   * only JSON can be saved: the component alone cannot build a standalone page.
   */
  html?: () => string
  /** Opens a link. Default: a normal link to a new tab. Set it in sandboxed frames that cannot open tabs. */
  openLink?: (url: string) => void
  /** Saves a file. Default: a browser download. Set it in sandboxed frames that cannot download. */
  download?: (file: MenuFile) => void
}

export const VERSION = __TAKESIX_REACT_VERSION__

export const TOO_BIG_MESSAGE = 'This diagram is too big to open by link. Big Diagrams export coming soon.'

/** File name for a document: its title in kebab case. */
export function fileName(doc: TakeSixDocument, extension: string): string {
  const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'diagram'}${extension}`
}

function browserDownload({ name, mimeType, text }: MenuFile) {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Some browsers start the download after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Round logo button in the bottom-left corner with a small menu: editor, save, version. */
export function Menu({ document: doc, options, onCopyLink }: {
  document: TakeSixDocument
  options: MenuOptions
  /** Copies a link to the screen on view; resolves to whether it worked. */
  onCopyLink?: () => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  // Feedback of "Copy link to this screen"
  const [copied, setCopied] = useState<boolean | null>(null)
  // undefined while the link is being packed, null when the diagram is too big
  const [link, setLink] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const editorUrl = options.editorUrl ?? DEFAULT_EDITOR_URL

  // Pack the link when the menu opens, so the click is a plain link click
  // (async work between click and window.open would trip popup blockers)
  useEffect(() => {
    if (!open) return
    let current = true
    setLink(undefined)
    createEditorLink(doc, editorUrl).then(
      url => { if (current) setLink(url) },
      () => { if (current) setLink(null) },
    )
    return () => { current = false }
  }, [open, doc, editorUrl])

  // Close on Escape and on a click outside
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  function toggle() {
    setOpen(o => !o)
    setError(null)
    setCopied(null)
  }

  function save(file: MenuFile) {
    ;(options.download ?? browserDownload)(file)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={styles.menuRoot}>
      {open && (
        <div id={menuId} className={styles.menu} role="menu" aria-label="TakeSix">
          <a
            className={styles.item}
            role="menuitem"
            href={link ?? undefined}
            target="_blank"
            rel="noopener"
            aria-disabled={link === undefined}
            onClick={e => {
              if (link && !options.openLink) {
                setOpen(false)
                return
              }
              e.preventDefault()
              if (link === null) setError(TOO_BIG_MESSAGE)
              else if (link) {
                options.openLink!(link)
                setOpen(false)
              }
            }}
          >
            Open in editor
          </a>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {onCopyLink && (
            <button
              type="button"
              className={styles.item}
              role="menuitem"
              onClick={() => onCopyLink().then(setCopied, () => setCopied(false))}
            >
              {copied === true ? 'Link copied' : copied === false ? 'Could not copy the link' : 'Copy link to this screen'}
            </button>
          )}
          <div className={styles.saveRow}>
            <span className={styles.saveLabel}>Save as</span>
            {options.html && (
              <button
                type="button"
                className={styles.chip}
                role="menuitem"
                onClick={() => save({ name: fileName(doc, '.html'), mimeType: 'text/html', text: options.html!() })}
              >
                HTML
              </button>
            )}
            <button
              type="button"
              className={styles.chip}
              role="menuitem"
              onClick={() => save({ name: fileName(doc, '.takesix.json'), mimeType: 'application/json', text: serializeDocument(doc) })}
            >
              JSON
            </button>
          </div>
          <p className={styles.version}>TakeSix v{VERSION}</p>
        </div>
      )}
      <button
        type="button"
        className={styles.fab}
        aria-label="TakeSix menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        <LogoIcon size={24} />
      </button>
    </div>
  )
}
