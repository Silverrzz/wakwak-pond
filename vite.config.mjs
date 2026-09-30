import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';

const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};
const pieceLicenses = new Map(
  ['ATTRIBUTION.txt', 'COPYING.txt'].map((name) => [
    `/licenses/pieces/${name}`,
    readFileSync(new URL(`./src/pieces/${name}`, import.meta.url))
  ])
);

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    vue(),
    {
      name: 'piece-licenses',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const path = request.url?.split('?')[0];
          if (path === '/licenses' || path === '/licenses/') {
            response.writeHead(302, { Location: '/licenses/index.html' });
            response.end();
            return;
          }
          const source = pieceLicenses.get(path);
          if (!source) return next();
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(source);
        });
      },
      generateBundle() {
        for (const [path, source] of pieceLicenses) {
          this.emitFile({
            type: 'asset',
            fileName: path.slice(1),
            source
          });
        }
      }
    }
  ],
  server: { headers },
  preview: { headers },
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0 }
});
