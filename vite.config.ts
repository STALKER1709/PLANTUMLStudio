import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Le renderer est une application web classique servie par Vite en dev
// et chargée depuis le disque (file://) en production : `base: './'` est
// indispensable pour que les chemins des assets restent relatifs.
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    sourcemap: true,
    // Monaco est volumineux : on le sort dans son propre chunk pour garder
    // un bundle applicatif lisible.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('monaco-editor') ? 'monaco' : undefined),
      },
    },
  },
});
