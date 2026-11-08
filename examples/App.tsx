import { useEffect, useRef, useState } from 'react'
import { createDocument, formatIssues, parseDocument, serializeDocument, type TakeSixDocument } from '@takesix/core'
import { PRELOADER_HTML, TakeSix, type Theme } from '../src'
import { sample } from './sample'
// Inlined so the logo takes the text colour (it draws with currentColor)
import logoSvg from './takesix-logo.svg?raw'
import styles from './App.module.css'

// ?src=<url> opens a document from that URL instead of the sample.
const src = new URLSearchParams(window.location.search).get('src')

export function App() {
  // With ?src nothing is shown until it loads, so the sample does not flash first
  const [doc, setDoc] = useState<TakeSixDocument | null>(src ? null : sample)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [theme, setTheme] = useState<Theme>('auto')
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

  useEffect(() => {
    if (!src) return
    fetch(src)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then(open, (e: Error) => setError(`Cannot load ${src}: ${e.message}`))
  }, [])

  function handleExport() {
    if (!doc) return
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
    <div className={styles.app} data-theme={theme}>
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
          className={`${styles.btn} ${styles.editBtn} ${styles.themeBtn}`}
          onClick={() => setTheme(t => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'))}
          title="Colour theme: auto follows the system"
        >
          Theme: {theme[0]!.toUpperCase() + theme.slice(1)}
        </button>
        <button
          className={`${styles.btn} ${editing ? styles.btnActive : ''}`}
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
        {doc && <TakeSix key={version} document={doc} onChange={setDoc} editing={editing} theme={theme} />}
        {/* ?src is loading: the same screen the page showed before the script ran */}
        {!doc && !error && <div className={styles.loading} dangerouslySetInnerHTML={{ __html: PRELOADER_HTML }} />}
      </main>
    </div>
  )
}
