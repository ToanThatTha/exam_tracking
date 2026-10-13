import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend gọi /api/... → Vite chuyển tiếp sang backend Express (cổng 4000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  preview: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  build: { chunkSizeWarningLimit: 4000 },
});
