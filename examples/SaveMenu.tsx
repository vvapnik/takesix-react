import { useEffect, useRef, useState } from 'react'
import { serializeDocument, type TakeSixDocument } from '@takesix/core'
import { createEditorLink } from '../src'
import styles from './App.module.css'

/** File name for a document: its title in kebab case. */
function fileName(doc: TakeSixDocument, extension: string): string {
  const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'diagram'}${extension}`
}

function download(text: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Some browsers start the download after click() returns
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Save: the document as JSON, as one HTML file, or as an editor link copied to the clipboard. */
export function SaveMenu({ doc, onError }: { doc: TakeSixDocument; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on Escape and on a click outside
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onPointer = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  function saveJson() {
    download(serializeDocument(doc), 'application/json', fileName(doc, '.takesix.json'))
    setOpen(false)
  }

  // The standalone viewer (the whole viewer with React) is a separate chunk,
  // loaded only when someone saves HTML
  async function saveHtml() {
    setOpen(false)
    const { standaloneHtml } = await import('../src/standalone')
    download(standaloneHtml(doc), 'text/html', fileName(doc, '.html'))
  }

  async function copyLink() {
    setOpen(false)
    try {
      const link = await createEditorLink(doc)
      if (!link) { onError('This diagram is too big to open by link: save it as JSON or HTML.'); return }
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch (e) {
      onError(`Could not copy the link: ${(e as Error).message}`)
    }
  }

  return (
    <div ref={rootRef} className={styles.dropdown}>
      <button className={styles.btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {copied ? 'Link copied' : 'Save'}
      </button>
      {open && (
        <div className={styles.dropdownMenu} role="menu" aria-label="Save">
          <button role="menuitem" className={styles.dropdownItem} onClick={saveJson}>JSON</button>
          <button role="menuitem" className={styles.dropdownItem} onClick={saveHtml}
            title="One HTML file that opens as the diagram without a server">HTML</button>
          <button role="menuitem" className={styles.dropdownItem} onClick={copyLink}
            title="Copies a link to the online editor with the diagram inside">Link</button>
        </div>
      )}
    </div>
  )
}
