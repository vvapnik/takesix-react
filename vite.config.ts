import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'

// Extra folder the demo may open documents from (?src=/@fs/<path>), dev server only.
const docsDir = process.env.TAKESIX_DOCS_DIR

export default defineConfig({
  plugins: [react()],
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
