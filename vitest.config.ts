import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // lib/**/*.test.ts bewusst NICHT eingeschlossen: die bestehenden Tests
    // dort (password-validation, hessen-plz, secon) sind node:test-Skripte
    // (npm run test:unit → tsx --test), keine Vitest-Suiten — vitest würde
    // sie mit "No test suite found" als fehlgeschlagen melden.
    include: ['__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'native', '.claude'],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
