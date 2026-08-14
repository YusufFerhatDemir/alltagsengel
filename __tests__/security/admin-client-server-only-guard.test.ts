/**
 * Phase 2: Server-Only Guard für lib/supabase/admin.ts
 *
 * lib/supabase/admin.ts ist der EINZIGE Ort im Repo, der den
 * SUPABASE_SERVICE_ROLE_KEY zu einem Client verarbeitet (siehe
 * app/api/**, lib/fcm.ts, lib/audit-log.ts, lib/push.ts, etc. — alle
 * importieren createAdminClient von hier statt selbst einen Client zu
 * bauen). Der Guard hier ist damit der einzige Kontrollpunkt für alle
 * privilegierten Supabase-Zugriffe im Next.js-Bundle.
 *
 * Zwei Schichten, beide hier getestet:
 *   1. `import 'server-only'` — wirft beim BUILD, sobald ein
 *      Client-Modul diese Datei (transitiv) importiert.
 *   2. Runtime-Guard `typeof window !== 'undefined'` — fängt den Fall,
 *      dass der Code trotzdem im Browser ausgeführt wird.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('lib/supabase/admin.ts — Server-Only Guard', () => {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window')
  const originalWindow = (globalThis as { window?: unknown }).window

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = originalWindow
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  })

  it('wirft beim Import, sobald ein `window`-Objekt existiert (simulierter Client-Kontext)', async () => {
    ;(globalThis as { window?: unknown }).window = {}

    await expect(import('@/lib/supabase/admin')).rejects.toThrow(
      /SECURITY.*darf nicht in Client-Komponenten importiert werden/
    )
  })

  it('laesst sich im Server-Kontext (kein `window`) normal importieren', async () => {
    delete (globalThis as { window?: unknown }).window

    const mod = await import('@/lib/supabase/admin')
    expect(typeof mod.createAdminClient).toBe('function')
  })

  it('jede Route/Lib mit SUPABASE_SERVICE_ROLE_KEY-Zugriff geht ausschliesslich ueber createAdminClient()', async () => {
    // Regressionsschutz: verhindert, dass künftig wieder eigene
    // `createClient(url, SERVICE_ROLE_KEY)`-Aufrufe außerhalb von
    // admin.ts auftauchen und damit den Guard umgehen.
    const { execSync } = await import('node:child_process')

    const grep = () =>
      execSync(
        String.raw`grep -rn "SUPABASE_SERVICE_ROLE_KEY" --include="*.ts" --include="*.tsx" app lib | grep -v "lib/supabase/admin.ts" | grep "createClient(" || true`,
        { cwd: process.cwd(), encoding: 'utf8' }
      )

    const treffer = grep().trim()
    expect(treffer, `Gefundene direkte Client-Konstruktion außerhalb admin.ts:\n${treffer}`).toBe('')
  })
})
