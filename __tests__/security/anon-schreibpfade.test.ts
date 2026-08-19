// ═══════════════════════════════════════════════════════════════════════
// Security-Audit 2026-08-19 — MITTEL-5, NIEDRIG-7, NIEDRIG-8
//
//   MITTEL-5  cron_check_ueberfaellige_aufgaben() war fuer `anon` ausfuehrbar
//             (live per PostgREST bestaetigt: HTTP 200). Ein Unbeteiligter
//             konnte ohne Anmeldung Statuswechsel auf ops_aufgaben samt
//             Eskalations- und Workflow-Triggern ausloesen.
//   NIEDRIG-7 coach_finde_nutzer_id(text) war fuer jeden angemeldeten Nutzer
//             ausfuehrbar → Mitgliedschafts-Orakel im Gesundheitskontext.
//   NIEDRIG-8 Oeffentliche Schreibendpunkte ohne Rate-Limit.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const WURZEL = process.cwd()
const lesen = (p: string) => readFileSync(join(WURZEL, p), 'utf8')

const REVOKE_MIGRATION = 'supabase/migrations/20260922000000_revoke_anon_cron_funktionen.sql'

describe('MITTEL-5: Cron-Funktion nicht mehr fuer anon aufrufbar', () => {
  const sql = lesen(REVOKE_MIGRATION)

  it('EXECUTE wird PUBLIC, anon und authenticated entzogen', () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC")
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM anon")
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated")
  })

  it('service_role behaelt EXECUTE (Server-Aufruf + pg_cron)', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION %s TO service_role')
  })

  it('die betroffene Funktion ist namentlich erfasst', () => {
    expect(sql).toContain('cron_check_ueberfaellige_aufgaben')
  })

  it('es gibt ein Rollback', () => {
    expect(lesen('supabase/migrations/20260922000001_rollback_revoke_anon_cron_funktionen.sql'))
      .toContain('cron_check_ueberfaellige_aufgaben')
  })
})

describe('NIEDRIG-7: Pseudonymitaets-Orakel im PflegeCoach', () => {
  const sql = lesen(REVOKE_MIGRATION)
  const route = lesen('app/api/coach/freigaben/route.ts')

  it('coach_finde_nutzer_id wird auf service_role beschraenkt', () => {
    expect(sql).toContain('coach_finde_nutzer_id')
  })

  it('die Route ruft die Funktion mit dem Service-Role-Client', () => {
    expect(route).toMatch(/createAdminClient\(\)[\s\S]{0,80}rpc\('coach_finde_nutzer_id'/)
  })

  it('der Lookup steht weiterhin hinter Auth UND Einwilligungspruefung', () => {
    const vorLookup = route.slice(0, route.indexOf("coach_finde_nutzer_id"))
    expect(vorLookup).toContain('requireCoachUser()')
    expect(vorLookup).toContain('hatAktiveEinwilligung')
  })

  it('kein anderer Aufrufer nutzt die Funktion mit dem Nutzer-Client', () => {
    expect(route).not.toContain("auth.supabase.rpc('coach_finde_nutzer_id'")
  })
})

describe('NIEDRIG-8: oeffentliche Schreibendpunkte sind ratenbegrenzt', () => {
  // Endpunkte, die der Audit als „ohne Rate-Limit" gefuehrt hat, plus die,
  // die schon vorher einen eigenen Limiter hatten.
  const ENDPUNKTE = [
    'app/api/auth/send-reset/route.ts',
    'app/api/newsletter/route.ts',
    'app/api/visitor-alert/route.ts',
    'app/api/analytics/capi/route.ts',
    'app/api/analytics/vitals/route.ts',
    'app/api/track/route.ts',
    'app/api/track-conversion/route.ts',
    'app/api/track/page-view/route.ts',
  ]

  for (const datei of ENDPUNKTE) {
    it(`${datei} begrenzt die Aufrufrate`, () => {
      const src = lesen(datei)
      // Entweder der gemeinsame Helfer aus lib/rate-limit oder ein eigener
      // Limiter im File (die aelteren Routen haben ihren eigenen).
      // rateLimitPersistent zaehlt instanzuebergreifend in der DB
      // (Master-Audit 2026-08-19, B-2) und zaehlt hier ebenfalls.
      const hatHelfer = /rateLimit\(/.test(src) || /rateLimitPersistent\(/.test(src)
      const hatEigenen = /resetAt|checkRate|checkTrackRateLimit|function ok\(/.test(src)
      expect(hatHelfer || hatEigenen, `${datei} ohne erkennbares Limit`).toBe(true)
    })
  }

  it('send-reset begrenzt zusaetzlich pro Ziel-Adresse, nicht nur pro IP', () => {
    const src = lesen('app/api/auth/send-reset/route.ts')
    expect(src).toContain('send-reset:ip:')
    expect(src).toContain('send-reset:mail:')
  })

  it('send-reset verraet auch beim Limit nicht, ob die Adresse existiert', () => {
    const src = lesen('app/api/auth/send-reset/route.ts')
    const limitBlock = src.slice(src.indexOf('send-reset:mail:'), src.indexOf('send-reset:mail:') + 400)
    expect(limitBlock).toContain('success: true')
    expect(limitBlock).not.toContain('429')
  })
})

describe('Gegenprobe: keine neue Route ohne Guard oder Limit', () => {
  // Bewusst offene Endpunkte (im Audit einzeln geprueft und begruendet).
  const OEFFENTLICH_OHNE_LIMIT = new Set([
    'app/api/client-ip/route.ts',
    'app/api/expansion/status/route.ts',
    'app/api/coach/tarife/route.ts',
    'app/api/google-reviews/route.ts',
    'app/api/pricing/calculate/route.ts',
  ])

  /**
   * Loest lokale Imports auf und prueft, ob die importierte Datei einen
   * require*()-Guard enthaelt. Eine reine Textsuche in der Route wuerde
   * sonst genau die Faelle als ungeschuetzt melden, in denen der Guard
   * bewusst in der Service-Schicht sitzt (z. B. die Verifizierungs-Routen).
   */
  function delegiertMitGuard(src: string): boolean {
    for (const treffer of src.matchAll(/from ['"]@\/(lib\/[^'"]+)['"]/g)) {
      for (const endung of ['.ts', '.tsx', '/index.ts']) {
        try {
          const ziel = lesen(`${treffer[1]}${endung}`)
          if (/require[A-Za-z]*\(/.test(ziel)) return true
          break
        } catch { /* naechste Endung */ }
      }
    }
    return false
  }

  function routen(verzeichnis: string, treffer: string[] = []): string[] {
    for (const e of readdirSync(join(WURZEL, verzeichnis), { withFileTypes: true })) {
      const rel = `${verzeichnis}/${e.name}`
      if (e.isDirectory()) routen(rel, treffer)
      else if (e.name === 'route.ts') treffer.push(rel)
    }
    return treffer
  }

  it('jede schreibende Route hat einen Guard, ein Secret oder ein Rate-Limit', () => {
    const ohne: string[] = []
    for (const datei of routen('app/api')) {
      const src = lesen(datei)
      if (!/export async function (POST|PUT|PATCH|DELETE)/.test(src)) continue
      if (OEFFENTLICH_OHNE_LIMIT.has(datei)) continue

      const bewacht =
        /require[A-Za-z]*\(/.test(src) ||
        /auth\.getUser\(/.test(src) ||
        /CRON_SECRET/.test(src) ||
        /x-service-key/.test(src) ||
        /stripe\.webhooks|constructEvent/.test(src) ||
        /x-hub-signature|verifyMetaSignature/.test(src) ||
        /rateLimit\(/.test(src) ||
        /resetAt|checkRate|checkTrackRateLimit|function ok\(/.test(src) ||
        // Guard eine Ebene tiefer: die Route reicht an eine Service-Schicht
        // durch, die selbst einen require*()-Guard aufruft. Wird hier nicht
        // geglaubt, sondern in der Zieldatei nachgesehen.
        delegiertMitGuard(src)

      if (!bewacht) ohne.push(datei)
    }
    expect(ohne, `Schreibende Routen ohne Guard/Limit:\n${ohne.join('\n')}`).toEqual([])
  })
})
