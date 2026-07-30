import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: true,
    watch: {
      ignored: ['**/.netlify/**']
    }
  },
  build: {
    sourcemap: false,
    target: 'es2020'
  }
});
