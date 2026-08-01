import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/.netlify/functions/getCyclones': {
        target: 'https://www.gdacs.org',
        changeOrigin: true,
        rewrite: () => '/gdacsapi/api/Events/geteventlist/SEARCH?eventlist=TC'
      }
    },
    watch: {
      ignored: ['**/.netlify/**']
    }
  },
  build: {
    sourcemap: false,
    target: 'es2020'
  }
});
