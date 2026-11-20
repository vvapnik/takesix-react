import type { ReactNode } from 'react'
import styles from '../Viewer.module.css'

/** A bar above the level while choosing blocks: what to do, and buttons to finish or cancel. */
export function StatusBar({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div className={styles.linkBar} role="status">
      <span>{children}</span>
      {actions}
    </div>
  )
}

export function StatusButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button className={styles.linkBarCancel} disabled={disabled} onClick={onClick}>{children}</button>
}
