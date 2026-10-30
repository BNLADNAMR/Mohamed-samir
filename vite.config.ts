import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';

export default defineConfig(({command}) => {
  return {
    base: './',
    plugins: [
      {
        name: 'dev-entry-rewrite',
        transformIndexHtml(html) {
          if (command === 'serve') {
            return html.replace(
              '<script src="./gh-pages-loader.js"></script>',
              '<script type="module" src="/src/main.tsx"></script>'
            );
          }
          return html;
        },
      },
      react(),
      tailwindcss(),
      ...(command === 'build' ? [viteSingleFile()] : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      copyPublicDir: false,
      target: 'es2020',
      rollupOptions: {
        input:
          command === 'build'
            ? path.resolve(import.meta.dirname, 'build-entry.html')
            : path.resolve(import.meta.dirname, 'index.html'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
