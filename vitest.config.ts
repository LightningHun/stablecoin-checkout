import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['tests/{unit,component,contract}/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./scripts/test-storage-setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 10000,
  },
})
