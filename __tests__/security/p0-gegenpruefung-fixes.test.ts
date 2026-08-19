/**
 * P0: Gegenprüfung Betriebsabnahme — Regressionstests für Fixes vom 12.08.2026
 *
 * Geprüft:
 * 1) SEPA-Mandate-Revoke: Org-Fence muss greifen (revokeMandate + Route)
 * 2) Dunning-Eskalation: Org-Fence auf Invoice vor Eskalation
 * 3) Klärfall-Zuordnung: Invoice muss zur gleichen Org gehören (manuellZuordnen)
 * 4) Budget-Warnung: EUR-Beträge dürfen nicht durch 100 geteilt werden
 * 5) EDIFACT-Encoding: Nutzdaten müssen als ISO-8859-1 kodiert werden
 * 6) Storno: CAS-Check gegen parallelen Doppel-Storno
 * 7) Rechnungsnummer-Fallback: CAS-Guard gegen Race Condition
 * 8) Pflegekasse-IK: Prüfziffer muss validiert werden (nicht nur Prefix)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

describe('SEPA-Mandate-Revoke Org-Fence', () => {
  it('revokeMandate akzeptiert expectedOrgId-Parameter', () => {
    const src = read('lib/billing/sepa/sepa-service.ts')
    expect(src).toContain('expectedOrgId')
    expect(src).toContain('.eq(\'organization_id\', expectedOrgId)')
  })

  it('Route übergibt organizationId an revokeMandate', () => {
    const src = read('app/api/billing/sepa/mandates/[id]/revoke/route.ts')
    expect(src).toContain('auth.ctx.organizationId')
  })
})

describe('Dunning-Eskalation Org-Fence', () => {
  it('Route prüft Invoice gegen Organization vor Eskalation', () => {
    const src = read('app/api/billing/dunning/[invoiceId]/eskalieren/route.ts')
    expect(src).toContain('organization_id')
    expect(src).toContain('auth.ctx.organizationId')
    expect(src).toContain('Rechnung nicht gefunden')
  })
})

describe('Klärfall-Zuordnung Org-Fence', () => {
  it('manuellZuordnen prüft Invoice gegen organizationId', () => {
    const src = read('lib/billing/matching/matching-engine.ts')
    expect(src).toContain(".eq('organization_id', organizationId)")
    const invoiceSection = src.slice(src.indexOf('// Rechnung laden fuer offenen Betrag'))
    expect(invoiceSection).toContain('organization_id')
  })
})

describe('Budget-Warnung EUR/Cent-Konsistenz', () => {
  it('Budget-Warnung dividiert nicht durch 100', () => {
    const src = read('lib/personal/einsatzfreigabe.ts')
    const pruefeBudgetSection = src.slice(src.indexOf('async function pruefeBudget'))
    expect(pruefeBudgetSection).not.toContain('/ 100)')
    expect(pruefeBudgetSection).toContain('.toFixed(2)')
  })
})

describe('EDIFACT ISO-8859-1 Encoding', () => {
  it('Nutzdaten werden als Latin-1 kodiert, nicht als UTF-8', () => {
    const src = read('lib/abrechnung/kassenabrechnung-engine.ts')
    expect(src).toContain('encodeToLatin1')
    expect(src).not.toMatch(/new Blob\(\[datei\.inhalt\]/)
    expect(src).toContain('application/octet-stream')
  })

  it('Dateigröße wird als Latin-1-Bytelänge berechnet, nicht als UTF-8', () => {
    const src = read('lib/abrechnung/kassenabrechnung-engine.ts')
    // Die Groesse kommt aus byteLaengeLatin1() — genau ein Byte je Zeichen,
    // wie encodeToLatin1() es schreibt. Frueher stand hier direkt
    // `datei.inhalt.length`; der benannte Helfer ist dasselbe Ergebnis,
    // sagt aber, WARUM String-Laenge hier die Bytezahl ist.
    expect(src).toContain('byteLaengeLatin1')
    expect(src).toMatch(/dateigroesse_nutzdaten:\s*byteLaengeLatin1\(/)
    expect(src).toMatch(/nutzdaten_groesse_bytes:\s*byteLaengeLatin1\(/)
    // TextEncoder wuerde UTF-8 kodieren — Umlaute zaehlten dann doppelt.
    expect(src).not.toContain('TextEncoder')
  })
})

describe('Storno CAS-Guard (Double-Spend-Schutz)', () => {
  it('cancelInvoice nutzt CAS-Pattern für Status-Update', () => {
    const src = read('lib/billing/core/invoice-engine.ts')
    expect(src).toContain(".neq('status', 'storniert')")
    expect(src).toContain('bereits storniert (paralleler Zugriff)')
  })
})

describe('Rechnungsnummer-Fallback CAS-Guard', () => {
  it('Fallback nutzt optimistic locking via WHERE last_number = old', () => {
    const src = read('lib/billing/core/invoice-engine.ts')
    expect(src).toContain(".eq('last_number', seq.last_number)")
    expect(src).toContain('Nummernsequenz-Konflikt (paralleler Zugriff)')
  })
})

describe('Pflegekasse-IK Prüfziffer-Validierung', () => {
  it('EDIFACT-Validator prüft Pflegekasse-IK mit validateIK()', () => {
    const src = read('lib/abrechnung/edifact-validator.ts')
    const pflegekasseSection = src.slice(src.indexOf("startsWith('18')"))
    expect(pflegekasseSection).toContain('validateIK(fkt[5])')
  })
})
