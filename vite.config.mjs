import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [vue()],
  build: {
    outDir: '../renderer-dist',
    emptyOutDir: true,
    assetsInlineLimit: 0
  }
});
