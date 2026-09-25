import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [vue()],
  server: { headers },
  preview: { headers },
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0 }
});
