import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The public showcase website (07-public-website.md). Port 5180 keeps it clear of the admin app on 5173.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
    testTimeout: 15000,
  },
});
