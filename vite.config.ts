import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// Extra folder the demo may open documents from (?src=/@fs/<path>), dev server only.
const docsDir = process.env.TAKESIX_DOCS_DIR
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  // Shown in the menu as "TakeSix vX.Y.Z"
  define: { __TAKESIX_REACT_VERSION__: JSON.stringify(version) },
  server: {
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...(docsDir ? [docsDir] : [])] },
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
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
