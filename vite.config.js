import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build runs from a GitHub Pages project subpath
  // (user.github.io/subway_surfer/) or a domain root without reconfiguring.
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    open: true,
  },
});
