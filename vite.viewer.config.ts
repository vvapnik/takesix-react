import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The viewer for self-contained HTML pages: React, the component and the mount
// code in one IIFE script plus one stylesheet. @takesix/react/standalone
// inlines both, so it is built before the library.
const { version } = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __TAKESIX_REACT_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: 'build/viewer',
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/standalone/viewer.tsx'),
      name: 'TakeSixViewer',
      formats: ['iife'],
      fileName: () => 'viewer.js',
      cssFileName: 'viewer',
    },
  },
})
