/**
 * Das Tor gegen die stille Kappung bei tausend Zeilen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 101, abgeschlossen mit Block 102)
 *
 * PostgREST deckelt die zurueckgegebene Darstellung. LIVE GEMESSEN am
 * 14.09.2026: ein `select` auf page_views (10 359 Zeilen) liefert ohne
 * `limit` genau 1000 — HTTP 200, kein Fehler, keine Warnung. Die Wahrheit
 * steht allein im Header `Content-Range: 0-999/10359`.
 *
 * In Block 101 hat das den Loeschbericht der beiden Aufbewahrungslaeufe
 * untertrieben: gezaehlt wurde `data.length`, und live faellig waren
 * 2 835 page_views, 2 553 visitors und 2 511 visitor_locations — jede
 * Zahl ueber der Grenze.
 *
 * Dieses Tor haelt die Klasse. Der Test prueft die Regel selbst: was sie
 * trifft, was sie in Ruhe laesst, und dass ihre Ausnahmeliste sich nicht
 * in eine offene Tuer verwandeln kann.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  pruefeQuelle, veraltet, imBestand, BESTAND, UNBEGRENZT, type Befund,
} from '../../scripts/lint-zeilendeckel'

const DATEI = 'lib/beispiel/modul.ts'

function quelle(kette: string, danach: string): string {
  return `
async function x() {
  const { data, error } = await supabase
    .from('service_records')${kette}
;
  ${danach}
}
`
}

describe('Die Regel trifft die ungedeckelte Auswertung', () => {
  it('findet eine Summe ueber eine beobachtete Tabelle', () => {
    const b = pruefeQuelle(quelle(`
    .select('amount')
    .eq('client_id', id)`, 'const s = (data ?? []).reduce((a, r) => a + r.amount, 0)'), DATEI)
    expect(b).toHaveLength(1)
    expect(b[0].tabelle).toBe('service_records')
  })

  it('findet auch eine Zaehlung ueber .length', () => {
    expect(pruefeQuelle(quelle(`
    .select('id')`, 'const n = data.length'), DATEI)).toHaveLength(1)
  })

  it('und ein filter/map auf dem Ergebnis', () => {
    expect(pruefeQuelle(quelle(`
    .select('id')`, 'const offen = data.filter(r => !r.ok)'), DATEI)).toHaveLength(1)
  })
})

describe('Die Regel laesst in Ruhe, was seine Menge entschieden hat', () => {
  it('eine ausdrueckliche Begrenzung', () => {
    expect(pruefeQuelle(quelle(`
    .select('id')
    .limit(500)`, 'const n = data.length'), DATEI)).toHaveLength(0)
  })

  it('einen Bereich — so blaettert leseAlle()', () => {
    expect(pruefeQuelle(quelle(`
    .select('id')
    .range(von, bis)`, 'const n = data.length'), DATEI)).toHaveLength(0)
  })

  it('eine Einzelzeile', () => {
    // Die Nachbedingung muss `data` WIRKLICH auswerten, sonst prueft der
    // Test die Terminal-Erkennung gar nicht: ohne Auswertung ist jede
    // Stelle ohnehin kein Befund, und der Test waere gruen, egal was die
    // Regel mit `.single()` macht. Genau so stand er im ersten Anlauf.
    for (const t of ['.single()', '.maybeSingle()']) {
      expect(pruefeQuelle(quelle(`
    .select('id')
    ${t}`, 'const n = (data ?? []).length'), DATEI), t).toHaveLength(0)
    }
  })

  it('eine reine Zaehlung', () => {
    expect(pruefeQuelle(quelle(`
    .select('id', { count: 'exact', head: true })`, 'const n = (data ?? []).length'), DATEI)).toHaveLength(0)
  })

  it('Gegenprobe: dieselbe Kette OHNE Terminal ist ein Befund', () => {
    // Ohne diese Richtung sagen die vier Tests darueber nichts — sie
    // koennten alle gruen sein, weil die Regel ueberhaupt nichts findet.
    expect(pruefeQuelle(quelle(`
    .select('id')`, 'const n = (data ?? []).length'), DATEI)).toHaveLength(1)
  })

  it('ein Ergebnis, das gar nicht ausgewertet wird', () => {
    expect(pruefeQuelle(quelle(`
    .select('id')`, 'if (error) throw error'), DATEI)).toHaveLength(0)
  })

  it('und jede Tabelle, die eine natuerliche Obergrenze hat', () => {
    // Die Rechnungen EINES Klienten in EINEM Jahr werden nie tausend.
    // Ein Tor ueber alle 265 Fundstellen waere nach einer Woche
    // abgeschaltet — die Auswahl IST die Aussage.
    const q = `
  const { data } = await supabase
    .from('invoices')
    .select('total_amount')
;
  const s = (data ?? []).reduce((a, r) => a + r.total_amount, 0)
`
    expect(pruefeQuelle(q, DATEI)).toHaveLength(0)
  })
})

describe('Die beobachtete Liste sagt, was sie meint', () => {
  it('enthaelt die vier grossen Messtabellen', () => {
    for (const t of ['page_views', 'analytics_events', 'visitors', 'visitor_locations']) {
      expect(UNBEGRENZT, t).toContain(t)
    }
  })

  it('und die Tabellen, die je Einsatz bzw. Zustellversuch wachsen', () => {
    for (const t of ['service_records', 'notification_delivery_log', 'billing_audit_trail']) {
      expect(UNBEGRENZT, t).toContain(t)
    }
  })

  it('aber NICHT die, die je Kunde und Zeitraum begrenzt sind', () => {
    for (const t of ['invoices', 'clients', 'caregivers', 'client_budgets']) {
      expect(UNBEGRENZT, t).not.toContain(t)
    }
  })

  it('fuehrt keine Tabelle doppelt', () => {
    expect(new Set(UNBEGRENZT).size).toBe(UNBEGRENZT.length)
  })
})

describe('Die beiden behobenen Geldwege bleiben behoben', () => {
  it('der EDIFACT-Export blaettert', () => {
    const q = readFileSync('lib/abrechnung/kassenabrechnung-engine.ts', 'utf8')
    expect(pruefeQuelle(q, 'lib/abrechnung/kassenabrechnung-engine.ts')
      .filter(b => b.tabelle === 'service_records')).toHaveLength(0)
    expect(q).toContain('leseAlle')
  })

  it('der Probelauf ebenso', () => {
    const d = 'app/api/billing/dta/dry-run/route.ts'
    const q = readFileSync(d, 'utf8')
    expect(pruefeQuelle(q, d).filter(b => b.tabelle === 'service_records')).toHaveLength(0)
    expect(q).toContain('leseAlle')
  })

  it('und keiner der beiden steht im Bestand', () => {
    const liste = BESTAND.map(e => e.datei)
    expect(liste).not.toContain('lib/abrechnung/kassenabrechnung-engine.ts')
    expect(liste).not.toContain('app/api/billing/dta/dry-run/route.ts')
  })
})

describe('Die Ausnahmeliste prueft sich selbst', () => {
  it('ein Eintrag ohne Befund gilt als veraltet', () => {
    expect(veraltet([]).length).toBe(BESTAND.length)
  })

  it('ein gedeckter Eintrag nicht', () => {
    const e = BESTAND[0]
    const b: Befund = { datei: e.datei, tabelle: e.tabelle, zeile: 1, variable: 'data' }
    expect(veraltet([b])).not.toContainEqual(e)
    expect(imBestand(b)).toBe(true)
  })

  it('der Bestand ist eng gefasst — Datei UND Tabelle', () => {
    const b: Befund = {
      datei: BESTAND[0].datei, tabelle: 'page_views', zeile: 1, variable: 'data',
    }
    expect(imBestand(b)).toBe(false)
  })

  it('der Lauf bricht bei veralteten Eintraegen VOR der Entwarnung ab', () => {
    const q = readFileSync('scripts/lint-zeilendeckel.ts', 'utf8')
    expect(q.indexOf('if (tote.length > 0) {')).toBeLessThan(q.indexOf('if (neu.length === 0) {'))
    expect(q.slice(q.indexOf('const tote = veraltet('))).toContain('process.exit(1)')
  })

  it('die Liste kann nur schrumpfen', () => {
    // Keine feste Zahl: ein Test, der beim Aufraeumen zerbricht, erzieht
    // dazu, nicht aufzuraeumen.
    expect(BESTAND.length).toBeLessThanOrEqual(12)
  })
})

describe('Das Tor haengt in CI', () => {
  it('als eigener Schritt', () => {
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('npm run lint:zeilendeckel')
  })

  it('und ist als npm-Skript erreichbar', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['lint:zeilendeckel']).toBe('tsx scripts/lint-zeilendeckel.ts')
  })
})
