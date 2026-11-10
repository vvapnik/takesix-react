import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// The `takesix` command: one Node script. @takesix/core stays external (a
// dependency of the package); the standalone viewer is inlined as text.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    ssr: resolve(import.meta.dirname, 'src/bin.ts'),
    target: 'node22',
    rollupOptions: {
      output: { entryFileNames: 'cli.js', banner: '#!/usr/bin/env node' },
    },
  },
})
