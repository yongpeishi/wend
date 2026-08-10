import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts: vitest bundles its own nested copy of
// vite, and merging `test` into vite.config.ts's defineConfig() causes a type
// mismatch between the two `vite` module instances under `tsc -b`. No React
// plugin needed here either — esbuild's `jsx: react-jsx` (tsconfig) transforms
// .tsx in tests fine without vite-plugin-react's Fast Refresh machinery.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
