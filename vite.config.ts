/// <reference types="vitest" />
// LƯU Ý: defineConfig import từ 'vitest/config', KHÔNG phải từ 'vite'.
// Bản của 'vite' không nhận khóa `test` → TypeScript báo lỗi ngay.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
