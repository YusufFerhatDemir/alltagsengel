/**
 * Eine Forderung an die Kasse aus einer Liste, die niemand gelesen hatte
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 83) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * 1. `ladeAufbereitung()` in lib/abrechnung/sgb-v/versand.ts ist der
 *    Datenzugriff des ECHTEN § 302-Laufs. Der Kommentar daneben sagt es:
 *    „was hier durchkommt, wird als Forderung an die Kasse übermittelt."
 *    Drei Abfragen, alle ungeprüft als leere Liste weiterverarbeitet.
 *
 *    Am tückischsten sind die Verordnungen: aus ihnen entsteht `hkpIds`,
 *    und der Filter darunter (`hkpIds.has(l.verordnung_id)`) wirft dann
 *    JEDE Leistung heraus. Ein Ausfall dieser einen Abfrage hätte den
 *    ganzen Monat unauffällig auf null gebracht — mit vorhandenen
 *    Nachweisen in der Datenbank.
 *
 * 2. GET /api/billing/monthly-closing liefert die Kennzahlen, auf deren
 *    Grundlage ein Monat abgeschlossen wird. Vier Abfragen, alle
 *    ungeprüft: null Einsätze, null Rechnungen, 0,00 € Umsatz, keine
 *    offenen Posten — und `closingStatus` auf 'gelb'.
 *
 * 3. Und der Riegel aus Block 79 konnte beide gar nicht bemerken: seine
 *    Selbstprüfung las nur app/ und components/. Einträge aus lib/ und
 *    app/api waren damit dauerhaft unprüfbar — ein dort behobener Fall
 *    wäre für immer von der Regel ausgenommen geblieben.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const VERSAND = readFileSync('lib/abrechnung/sgb-v/versand.ts', 'utf8')
const ROUTE = readFileSync('app/api/billing/monthly-closing/route.ts', 'utf8')
const LINT = readFileSync('scripts/lint-leerzustand.ts', 'utf8')

describe('§ 302: keine Aufbereitung aus ungelesenen Quellen', () => {
  const RUMPF = VERSAND.slice(
    VERSAND.indexOf('export async function ladeAufbereitung'),
    VERSAND.indexOf('export async function erzeugeUndVersendeSgbV'),
  )

  it('prüft alle drei Abfragen', () => {
    for (const f of ['leistungenRes.error', 'verordnungenRes.error', 'klientenRes.error']) {
      expect(RUMPF, f).toContain(f)
    }
  })

  it('bricht ab, statt eine leere Aufbereitung zu liefern', () => {
    expect(RUMPF).toContain('if (nichtLesbar.length > 0) {')
    expect(RUMPF).toContain('throw new Error(')
    expect(RUMPF).toMatch(/Es wurde NICHTS aufbereitet/)
  })

  it('und zwar VOR der Filterung über hkpIds', () => {
    // Danach wäre der Schaden schon geschehen: ohne Verordnungen wirft
    // der Filter jede Leistung heraus.
    const riegel = RUMPF.indexOf('if (nichtLesbar.length > 0)')
    expect(riegel).toBeGreaterThan(-1)
    expect(riegel).toBeLessThan(RUMPF.indexOf('const hkpIds = new Set'))
  })

  it('der Storno-Filter bleibt, wie er war', () => {
    expect(RUMPF).toContain('ohneStornierte((leistungenRes.data || []) as HkpLeistung[])')
  })
})

describe('Monatsabschluss-Kennzahlen: keine Nullen aus einem Lesefehler', () => {
  it('prüft alle vier Abfragen', () => {
    const teil = ROUTE.slice(ROUTE.indexOf('const nichtLesbar = [')).slice(0, 500)
    for (const f of [
      'recordsRes.error', 'invoicesRes.error', 'closingsRes.error', 'paymentsRes.error',
    ]) {
      expect(teil, f).toContain(f)
    }
  })

  it('antwortet mit 503 statt mit Nullen', () => {
    const teil = ROUTE.slice(ROUTE.indexOf('if (nichtLesbar.length > 0)')).slice(0, 700)
    expect(teil).toContain('status: 503')
    expect(teil).toMatch(/Null Einsätze wären von einem/)
  })

  it('und zwar VOR jeder Auswertung', () => {
    const riegel = ROUTE.indexOf('if (nichtLesbar.length > 0)')
    expect(riegel).toBeGreaterThan(-1)
    expect(riegel).toBeLessThan(ROUTE.indexOf('const alleRecords = recordsRes.data'))
  })
})

describe('Die Selbstprüfung des Riegels sieht jetzt beide Bereiche', () => {
  it('liest lib/ und app/api für die Veraltet-Prüfung mit', () => {
    expect(LINT).toContain("const weitereDateien = ['lib', 'app/api'].flatMap(")
    expect(LINT).toContain('veraltet([...alle, ...weitereBefunde], [...dateien, ...weitereDateien])')
  })

  it('blockiert dort aber weiterhin nicht', () => {
    // Die Entscheidung des Dateikopfs bleibt: was ein verworfener Fehler
    // in einer Entscheidung anrichtet, ist nicht mechanisch beurteilbar.
    const main = LINT.slice(LINT.indexOf('function main()'))
    expect(main).toContain('const befunde = alle.filter(b => !imBestand(b))')
    expect(main).not.toContain('befunde.push(...weitereBefunde)')
  })

  it('der Dateisammler kann beide Endungen', () => {
    expect(LINT).toContain('muster: RegExp = /\\.tsx$/')
  })

  it('und der Bestand ist kürzer geworden', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(52)
    expect(BESTAND_GEBUENDELT.some(e => e.datei.includes('sgb-v/versand'))).toBe(false)
    expect(BESTAND_GEBUENDELT.some(e => e.datei.includes('monthly-closing'))).toBe(false)
  })
})
