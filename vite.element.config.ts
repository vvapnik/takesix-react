import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// dist/element.js: one script that registers the <take-six> web component,
// for pages without React (loaded from a CDN such as jsDelivr). React, the
// viewer and its stylesheet are inside; the stylesheet goes into the
// element's shadow root, so the build puts it into the script as a string.
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

const PLACEHOLDER = /(["'`])__TAKESIX_ELEMENT_CSS__\1/

const inlineCss = (): Plugin => ({
  name: 'takesix-element-css',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const css = Object.values(bundle).filter(f => f.type === 'asset' && f.fileName.endsWith('.css'))
    const text = css.map(f => (f.type === 'asset' ? String(f.source) : '')).join('\n')
    for (const f of css) delete bundle[f.fileName]
    const chunk = Object.values(bundle).find(f => f.type === 'chunk')
    if (chunk?.type !== 'chunk' || !PLACEHOLDER.test(chunk.code)) this.error('element.js: no place for the stylesheet')
    chunk.code = chunk.code.replace(PLACEHOLDER, () => JSON.stringify(text))
  },
})

export default defineConfig({
  plugins: [react(), inlineCss()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __TAKESIX_REACT_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/element/index.ts'),
      name: 'TakeSixElement',
      formats: ['iife'],
      fileName: () => 'element.js',
      cssFileName: 'element',
    },
  },
})
