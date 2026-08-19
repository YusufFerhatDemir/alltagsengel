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
    // Die PGlite-Suiten booten in beforeAll ein WASM-Postgres und spielen
    // echte Migrationen ein. Isoliert dauert das ~2s, unter Volllast der
    // kompletten Suite (170 Dateien parallel, mehrere WASM-Instanzen
    // gleichzeitig) aber deutlich laenger — mit Vitests Default von 10s
    // kippten hoch1-mandantentrennung-pglite und
    // persistenter-api-ratelimit-pglite reproduzierbar mit
    // "Hook timed out in 10000ms", waehrend sie einzeln in 3,6s
    // durchlaufen. Kein Testinhalt wird abgeschaltet, nur die
    // Hook-Schranke realistisch bemessen; 60s beenden einen echten
    // Haenger weiterhin zeitnah.
    hookTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Siehe __tests__/mocks/server-only.ts: das echte Package wirft in
      // jedem plain-Node-Kontext, nicht nur im Browser-Bundle.
      'server-only': path.resolve(__dirname, '__tests__/mocks/server-only.ts'),
    },
  },
})
