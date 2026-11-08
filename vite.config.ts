import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'
import { PRELOADER_HTML } from './src/preloader'

// Extra folder the demo may open documents from (?src=/@fs/<path>), dev server only.
const docsDir = process.env.TAKESIX_DOCS_DIR
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [
    react(),
    // The demo page shows the loading screen before its script runs
    { name: 'takesix-preloader', transformIndexHtml: html => html.replace('<div id="root"></div>', `<div id="root">${PRELOADER_HTML}</div>`) },
  ],
  // Shown in the menu as "TakeSix vX.Y.Z"
  define: { __TAKESIX_REACT_VERSION__: JSON.stringify(version) },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...(docsDir ? [docsDir] : [])] },
  },
  build: {
    lib: {
      // The loading screen has an entry of its own: pages and tools that only
      // need its HTML do not load React
      entry: { index: resolve(import.meta.dirname, 'src/index.ts'), preloader: resolve(import.meta.dirname, 'src/preloader.ts') },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@takesix/core'],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
})
