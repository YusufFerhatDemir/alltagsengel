/**
 * Zwei Befunde aus der Funktionalen Lueckenanalyse, geschlossen am 23.08.2026.
 *
 * Bereich 13 (P2) — Login-Weiterleitung las `user_metadata.role`, also genau
 * die Quelle, die `proxy.ts` als manipulierbar verwirft. Fuer die
 * Zugriffskontrolle war das folgenlos (die Middleware entscheidet), aber wer
 * nur `profiles.role` gesetzt hatte, landete nach dem Login im falschen
 * Portal.
 *
 * Bereich 14 (P2) — `/api/leistungsnachweis/crud` schrieb keinen einzigen
 * Audit-Eintrag: bei 30 live erfassten Nachweisen standen 0 zugehoerige
 * Zeilen in `mis_audit_log`. Fuer Abrechnungsunterlagen nach SGB XI ist die
 * Nachvollziehbarkeit jeder Aenderung Pflicht.
 *
 * Beides sind Quelltext-Eigenschaften, keine Laufzeitpfade — deshalb als
 * statischer Scan geprueft. Ein Verhaltenstest wuerde hier nur die Attrappe
 * pruefen, nicht die Regression.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const WURZEL = path.resolve(__dirname, '../..')

function lies(relativerPfad: string): string {
  return fs.readFileSync(path.join(WURZEL, relativerPfad), 'utf8')
}

describe('Bereich 13: Login liest keine manipulierbare Rollenquelle', () => {
  const quelle = lies('app/auth/login/page.tsx')

  it('nachAnmeldung leitet die Rolle NICHT aus user_metadata ab', () => {
    expect(quelle).not.toMatch(/const\s+role\s*=\s*\(?\s*user\.user_metadata\?\.role/)
  })

  it('app_metadata.role ist EINE der beiden Quellen', () => {
    expect(quelle).toMatch(/user\.app_metadata\?\.role/)
  })

  it('profiles.role wird IMMER gelesen, nicht nur als Rueckfall', () => {
    // Geaendert am 28.08.2026: bis dahin stand hier „app_metadata gewinnt,
    // profiles als Fallback" — und profiles wurde gar nicht erst
    // abgefragt, wenn app_metadata gesetzt war. Nach einer Herabstufung
    // in der Datenbank schickte der Login die Person damit weiter in den
    // Verwaltungsbereich. Jetzt entscheidet wirksameRolle() aus beiden
    // Quellen; siehe __tests__/security/rollenquelle-wirksam.test.ts.
    const abschnitt = quelle.slice(quelle.indexOf('async function nachAnmeldung'))
    expect(abschnitt).toMatch(/from\('profiles'\)/)
    expect(abschnitt).toMatch(/select\('role'\)/)
    expect(abschnitt).toMatch(/wirksameRolle\(/)
    // Der alte „nur wenn leer"-Rueckfall darf nicht wiederkommen.
    expect(abschnitt).not.toMatch(/let role = \(user\.app_metadata/)
  })

  it('die Rolle angehoerige fuehrt ins Angehoerigenportal', () => {
    expect(quelle).toMatch(/role === 'angehoerige'/)
    expect(quelle).toMatch(/'\/angehoerige'/)
  })
})

describe('Bereich 13: proxy.ts schuetzt /angehoerige serverseitig', () => {
  const quelle = lies('proxy.ts')

  it('/angehoerige steht in PROTECTED_PREFIXES', () => {
    const zeile = quelle.match(/const PROTECTED_PREFIXES = \[[^\]]*\]/)?.[0] ?? ''
    expect(zeile).toContain("'/angehoerige'")
  })

  it('/angehoerige steht im Middleware-Matcher', () => {
    expect(quelle).toContain("'/angehoerige/:path*'")
  })

  it('die Rolle angehoerige hat genau einen erlaubten Bereich', () => {
    expect(quelle).toMatch(/angehoerige:\s*\['\/angehoerige'\]/)
  })

  it('admin und superadmin duerfen den Bereich ebenfalls betreten', () => {
    const block = quelle.slice(
      quelle.indexOf('const ROLE_ACCESS'),
      quelle.indexOf('const ROLE_HOME'),
    )
    const adminZeile = block.match(/^\s*admin:.*$/m)?.[0] ?? ''
    const superZeile = block.match(/^\s*superadmin:.*$/m)?.[0] ?? ''
    expect(adminZeile).toContain('/angehoerige')
    expect(superZeile).toContain('/angehoerige')
  })
})

describe('Bereich 14: Leistungsnachweis-CRUD protokolliert jeden Schreibvorgang', () => {
  const quelle = lies('app/api/leistungsnachweis/crud/route.ts')

  it('nutzt das Pflichtmuster logAuditEventOrWarn', () => {
    expect(quelle).toContain("import { logAuditEventOrWarn } from '@/lib/audit-log'")
    expect(quelle).toContain('await logAuditEventOrWarn(')
  })

  it('protokolliert unter dem Entity-Typ service_record', () => {
    expect(quelle).toMatch(/entityType:\s*'service_record'/)
  })

  it('deckt alle fuenf Schreibpfade ab', () => {
    for (const vorgang of [
      'leistungsnachweis_erfasst',
      'leistungsnachweis_unterschrieben',
      'leistungsnachweis_bestaetigt',
      'leistungsnachweis_storniert',
      'leistungsnachweis_geaendert',
    ]) {
      expect(quelle).toContain(vorgang)
    }
  })

  it('jeder Aufruf von protokolliere() wird awaited — sonst reisst er in der Serverless-Funktion ab', () => {
    const treffer = quelle.match(/^[^\n]*\bprotokolliere\(/gm) ?? []
    // Definition + fuenf Aufrufstellen
    expect(treffer.length).toBeGreaterThanOrEqual(6)
    const aufrufe = treffer.filter(z => !z.includes('async function'))
    expect(aufrufe).toHaveLength(5)
    for (const zeile of aufrufe) {
      expect(zeile).toMatch(/await\s+protokolliere\(/)
    }
  })
})
