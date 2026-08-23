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
    // Tests, die selbst ein WASM-Postgres hochfahren (die Rollback-Faelle
    // der Migrationssuiten legen dafuer eine ZWEITE Instanz an), brauchen
    // dieselbe Luft wie die Hooks: unter Volllast der ganzen Suite lagen
    // sie reproduzierbar ueber 15s, einzeln bei rund 3s. Die 15s standen
    // hier nur historisch — sie haben nie einen echten Haenger gefangen,
    // sondern drei Suiten sporadisch rot gemacht.
    testTimeout: 60000,
    // Die PGlite-Suiten booten in beforeAll ein WASM-Postgres und spielen
    // echte Migrationen ein. Isoliert dauert das ~2s, unter Volllast der
    // kompletten Suite (170 Dateien parallel, mehrere WASM-Instanzen
    // gleichzeitig) aber deutlich laenger — mit Vitests Default von 10s
    // kippten hoch1-mandantentrennung-pglite und
    // persistenter-api-ratelimit-pglite reproduzierbar mit
    // "Hook timed out in 10000ms", waehrend sie einzeln in 3,6s
    // durchlaufen. Kein Testinhalt wird abgeschaltet, nur die
    // Hook-Schranke realistisch bemessen; 120s beenden einen echten
    // Haenger weiterhin zeitnah.
    //
    // 60s reichten nicht: kanaele-e2e-pglite spielt in beforeAll mehrere
    // Migrationen ein und kippte im Gesamtlauf weiterhin.
    hookTimeout: 120000,
    // ACHTUNG: ein eigener Wert am Hook (`beforeAll(fn, 60_000)`)
    // UEBERSCHREIBT diesen hier. Beim Anheben deshalb immer beides
    // pruefen — 2026-08-23 kippten sonst weiterhin fuenf Suiten mit
    // "Hook timed out in 60000ms", obwohl die Config auf 120s stand:
    //   grep -rn "}, *[0-9_]\{4,\})" __tests__/
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
