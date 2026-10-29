import { useRef, useState } from 'react'
import { createDocument, formatIssues, parseDocument, serializeDocument, type TakeSixDocument } from '@takesix/core'
import { TakeSix } from '../src'
import { sample } from './sample'
import styles from './App.module.css'

export function App() {
  const [doc, setDoc] = useState<TakeSixDocument>(sample)
  const [error, setError] = useState<string | null>(null)
  // Remount the viewer on New/Import so navigation starts at the top level.
  const [version, setVersion] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function load(next: TakeSixDocument) {
    setDoc(next)
    setVersion(v => v + 1)
  }

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
    const result = parseDocument(await file.text())
    if (result.ok) {
      setError(null)
      load(result.document)
    } else {
      setError(formatIssues(result.issues))
    }
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.logo}>TakeSix</span>
        <div className={styles.sep} />
        <button className={styles.btn} onClick={() => load(createDocument({ title: 'Untitled' }))}>New</button>
        <button className={styles.btn} onClick={() => load(sample)}>Sample</button>
        <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>Import</button>
        <button className={styles.btn} onClick={handleExport}>Export</button>
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
        <TakeSix key={version} document={doc} onChange={setDoc} />
      </main>
    </div>
  )
}
