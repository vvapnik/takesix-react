import type { TakeSixDocument } from '@takesix/core'
import { renderHtml } from './html.js'
// Built before the library by vite.viewer.config.ts (React included, ~270 KB)
import viewerJs from '../../build/viewer/viewer.js?raw'
import viewerCss from '../../build/viewer/viewer.css?raw'

export { renderHtml }

/** A self-contained HTML page for a document: opens as the diagram without a server or network. */
export function standaloneHtml(doc: TakeSixDocument): string {
  return renderHtml(doc, viewerJs, viewerCss)
}
