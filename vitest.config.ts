import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000, // 30s for Firebase operations
    hookTimeout: 30000,
    // Run integration tests sequentially to avoid race conditions
    fileParallelism: false,
    sequence: {
      concurrent: false
    }
  }
})
