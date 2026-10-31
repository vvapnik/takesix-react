import { useEffect, useRef, useState } from 'react'
import { createDocument, formatIssues, parseDocument, serializeDocument, type TakeSixDocument } from '@takesix/core'
import { TakeSix } from '../src'
import { sample } from './sample'
// Inlined so the logo takes the text colour (it draws with currentColor)
import logoSvg from './takesix-logo.svg?raw'
import styles from './App.module.css'

export function App() {
  const [doc, setDoc] = useState<TakeSixDocument>(sample)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  // Remount the viewer on New/Import so navigation starts at the top level.
  const [version, setVersion] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load(next: TakeSixDocument) {
    setDoc(next)
    setVersion(v => v + 1)
  }

  function open(text: string) {
    const result = parseDocument(text)
    if (result.ok) {
      setError(null)
      load(result.document)
    } else {
      setError(formatIssues(result.issues))
    }
  }

  // ?src=<url> opens a document from that URL instead of the sample.
  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get('src')
    if (!src) return
    fetch(src)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then(open, (e: Error) => setError(`Cannot load ${src}: ${e.message}`))
  }, [])

  function handleExport() {
    const blob = new Blob([serializeDocument(doc)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'takesix.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset input so the same file can be re-imported
    e.target.value = ''
    if (!file) return
    open(await file.text())
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.logo}>
          <span className={styles.logoMark} aria-hidden="true" dangerouslySetInnerHTML={{ __html: logoSvg }} />
          TakeSix
        </span>
        <div className={styles.sep} />
        <button className={styles.btn} onClick={() => load(createDocument({ title: 'Untitled' }))}>New</button>
        <button className={styles.btn} onClick={() => load(sample)}>Sample</button>
        <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>Import</button>
        <button className={styles.btn} onClick={handleExport}>Export</button>
        <button
          className={`${styles.btn} ${styles.editBtn} ${editing ? styles.btnActive : ''}`}
          onClick={() => setEditing(e => !e)}
          aria-pressed={editing}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </header>

      {error && (
        <pre className={styles.error} role="alert">
          {error}
          <button className={styles.btn} onClick={() => setError(null)}>Dismiss</button>
        </pre>
      )}

      <main className={styles.main}>
        <TakeSix key={version} document={doc} onChange={setDoc} editing={editing} />
      </main>
    </div>
  )
}
