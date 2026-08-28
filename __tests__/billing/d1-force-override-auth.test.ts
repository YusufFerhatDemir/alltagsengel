import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

describe('D1: force_override Autorisierung', () => {
  const src = read('app/api/einsatzplanung/route.ts')

  describe('POST — Rollenprüfung', () => {
    it('prüft Rolle vor Akzeptanz von force_override', () => {
      // Seit dem Rollenkonzept ist das Uebersteuern an die Berechtigung
      // 'personal.schreiben' gebunden (admin/superadmin/pdl), nicht mehr an
      // eine Rollenliste — lib/auth/rollen.ts.
    // Track 7 (28.08.2026): die Entscheidung laeuft nicht mehr ueber
      // `rolleDarf(auth.role, …)` — `auth.role` ist die wirksame Rolle als
      // BESCHRIFTUNG (die engere der beiden Quellen), nicht deren
      // Schnittmenge. Entschieden wird jetzt ueber beide Quellen. Die
      // Aussage des Tests bleibt: force_override verlangt personal.schreiben.
      expect(src).toContain("body.force_override && !quellenDuerfen(auth.quellen, 'personal.schreiben')")
    })

    it('gibt 403 bei nicht-autorisiertem force_override', () => {
      expect(src).toContain("force_override ist nur fuer Administratoren erlaubt")
    })
  })

  describe('PATCH — Rollenprüfung', () => {
    it('prüft Rolle vor Akzeptanz von force_override in PATCH', () => {
      expect(src).toContain("force_override && !quellenDuerfen(auth.quellen, 'personal.schreiben')")
    })
  })

  describe('Audit-Trail', () => {
    it('importiert logBillingAction', () => {
      expect(src).toContain("import { logBillingAction }")
    })

    it('protokolliert force_override im Audit-Trail', () => {
      expect(src).toContain("action: 'force_override'")
    })

    it('protokolliert übersteuerte Checks', () => {
      expect(src).toContain('overridden_checks: warnungen')
    })

    it('protokolliert Actor-Rolle', () => {
      expect(src).toContain('actorRole: auth.role')
    })
  })
})
