import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const isAnalyze = process.env.NODE_ENV === 'analyze';

export default defineConfig({
  plugins: [
    {
      name: 'html-inject-pkg-name',
      transformIndexHtml: (html: string) => html.replace(/<title>[^<]*<\/title>/, `<title>${pkg.name}</title>`),
    },
    // i18n static mode plugin is no-op in dev mode
    { name: 'vite-plugin-i18n-noop' },
    isAnalyze && visualizer({ open: true, filename: 'dist/stats.html', gzipSize: true }),
  ],
  define: {
    'import.meta.env.VITE_I18N_MODE': JSON.stringify(process.env.VITE_I18N_MODE ?? 'dev'),
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/core/source'),
    },
  },
  server: {
    host: true,
    port: 1513,
    strictPort: true,
    allowedHosts: true,
    cors: true,
  },
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'ES2020',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/') || id.includes('/node_modules/.pnpm/three@')) {
            return 'three-vendor';
          }
          if (id.includes('@minigame/platform') || id.includes('@minigame/render-adapter')) {
            return 'platform';
          }
          if (id.includes('@minigame/core') || id.includes('@minigame/i18n')) {
            return 'game-logic';
          }
          return undefined;
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
