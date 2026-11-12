import { defineConfig } from 'vite';
export default defineConfig({
  base: '/sevenpoker2026/',
  build: { outDir: 'dist' },
  test: { include: ['test/**/*.test.ts'] },
} as any);
