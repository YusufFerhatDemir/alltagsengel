/**
 * Rechnungslauf — Tarifzuordnung vor der RPC
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 45, 14.09.2026)
 *
 * `create_invoice_draft_atomic` loest den Tarif ueber
 * `public.tarif_leistungsart(service_type)` auf. Gibt die Funktion NULL
 * zurueck, wirft die RPC MISSING_VALID_TARIFF — im Schleifenkoerper. Die
 * ganze Transaktion faellt zurueck: EIN Nachweis ueber Koerperpflege
 * laesst die vollstaendige Monatsrechnung des Klienten scheitern, und die
 * Meldung nennt nur den ersten Treffer.
 *
 * Der Sammelrechnungslauf prueft das vorher. Die Einzelrechnung und der
 * automatische Lauf gingen ohne diese Pruefung in die RPC — dieselbe Form
 * wie in Block 44: die Regel stand in einem Aufrufer statt am Engpass.
 *
 * Live am 14.09.2026: 2 von 30 Nachweisen ('Grosse Koerperpflege',
 * 'Medikamentengabe'), beide bei EINEM Klienten im Monat 2026-07.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ohneTarifSchluessel,
  assertZuordenbareLeistungsarten,
  assertTarifZuordnung,
  giltAlsStorniert,
  ZUORDNUNG_SPALTEN,
} from '@/lib/billing/tarif-zuordnung'
import { tarifLeistungsart } from '@/lib/billing/leistungsarten'
import { funktionAusMigration } from '../helpers/sql-extract'

const N = (id: string, service_type: string, date = '2026-07-03') => ({ id, date, service_type })

describe('giltAlsStorniert — die COALESCE-Bedingung der RPC', () => {
  it('NULL ist NICHT storniert — genau wie COALESCE es sagt', () => {
    expect(giltAlsStorniert({ proof_status: null, billing_status: null })).toBe(false)
    expect(giltAlsStorniert({})).toBe(false)
  })

  it('erkennt beide Spalten', () => {
    expect(giltAlsStorniert({ proof_status: 'STORNIERT' })).toBe(true)
    expect(giltAlsStorniert({ billing_status: 'STORNIERT' })).toBe(true)
  })

  it('laesst gewoehnliche Werte durch', () => {
    expect(giltAlsStorniert({ proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN' })).toBe(false)
  })
})

describe('ohneTarifSchluessel', () => {
  it('laesst zuordenbare Leistungsarten durch', () => {
    expect(ohneTarifSchluessel([
      N('a', 'Demenzbetreuung'), N('b', 'Haushaltshilfe'), N('c', 'Arztbegleitung'),
    ])).toEqual([])
  })

  it('findet die Leistungsarten ohne Schluessel', () => {
    const offen = ohneTarifSchluessel([
      N('a', 'Demenzbetreuung'), N('b', 'Grosse Koerperpflege'), N('c', 'Medikamentengabe'),
    ])
    expect(offen.map(o => o.id)).toEqual(['b', 'c'])
  })

  it('behandelt eine leere Leistungsart als nicht zuordenbar', () => {
    expect(ohneTarifSchluessel([N('a', '')]).map(o => o.id)).toEqual(['a'])
  })
})

describe('assertZuordenbareLeistungsarten', () => {
  it('schweigt, wenn alles zuzuordnen ist', () => {
    expect(() => assertZuordenbareLeistungsarten([N('a', 'Hauswirtschaft')])).not.toThrow()
  })

  it('nennt ALLE betroffenen Arten, nicht nur die erste', () => {
    // Der springende Punkt gegenueber der RPC: wer nach der Korrektur des
    // einen Nachweises den Lauf wiederholt, laeuft sonst in den naechsten.
    try {
      assertZuordenbareLeistungsarten([
        N('a', 'Grosse Koerperpflege'), N('b', 'Medikamentengabe'), N('c', 'Demenzbetreuung'),
      ])
      throw new Error('haette werfen muessen')
    } catch (err) {
      const m = (err as Error).message
      expect(m).toContain('Grosse Koerperpflege')
      expect(m).toContain('Medikamentengabe')
      expect(m).not.toContain('Demenzbetreuung')
      expect(m).toContain('2 Leistungsnachweis')
    }
  })

  it('sagt, dass die ganze Rechnung mitfaellt — nicht nur die eine Position', () => {
    try {
      assertZuordenbareLeistungsarten([N('a', 'Medikamentengabe')])
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect((err as Error).message).toContain('vollständig scheitern')
    }
  })

  it('wirft mit 422', () => {
    try {
      assertZuordenbareLeistungsarten([N('a', 'Medikamentengabe')])
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect((err as { status?: number }).status).toBe(422)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('assertTarifZuordnung — dieselbe Menge wie die RPC', () => {
  function fakeDb(zeilen: unknown[], fehler: unknown = null) {
    const filter: string[] = []
    const kette: Record<string, unknown> = {}
    for (const name of ['eq', 'in', 'gte', 'lte', 'select']) {
      kette[name] = (...args: unknown[]) => {
        filter.push(`${name}(${args.map(a => JSON.stringify(a)).join(',')})`)
        return kette
      }
    }
    kette.then = (aufl: (w: unknown) => unknown) => aufl({ data: zeilen, error: fehler })
    return {
      client: { from: () => kette } as never,
      filter,
    }
  }

  const P = {
    clientId: 'k1', organizationId: 'o1', periodMonth: '2026-07', budgetType: 'entlastung',
  }

  it('laesst eine saubere Auswahl durch', async () => {
    const { client } = fakeDb([N('a', 'Demenzbetreuung')])
    await expect(assertTarifZuordnung(client, P)).resolves.toBeUndefined()
  })

  it('wirft bei einer nicht zuordenbaren Leistungsart', async () => {
    const { client } = fakeDb([N('a', 'Grosse Koerperpflege')])
    await expect(assertTarifZuordnung(client, P)).rejects.toThrow('Tarif-Schlüssel')
  })

  it('sperrt NICHT wegen eines stornierten Nachweises', async () => {
    // Die RPC nimmt ihn gar nicht erst mit. Wer ihn hier bewertet,
    // verhindert eine Rechnung, die sonst entstanden waere — Ueber-Sperren
    // ist an dieser Stelle der schwerere Fehler.
    const { client } = fakeDb([
      { ...N('a', 'Grosse Koerperpflege'), proof_status: 'STORNIERT' },
      { ...N('b', 'Medikamentengabe'), billing_status: 'STORNIERT' },
      N('c', 'Demenzbetreuung'),
    ])
    await expect(assertTarifZuordnung(client, P)).resolves.toBeUndefined()
  })

  it('laedt die Status-Spalten mit — ohne sie waere der Ausschluss blind', async () => {
    const { client, filter } = fakeDb([])
    await assertTarifZuordnung(client, P)
    expect(filter.some(f => f.startsWith('select(') && f.includes('proof_status'))).toBe(true)
    expect(filter.some(f => f.startsWith('select(') && f.includes('billing_status'))).toBe(true)
  })

  it('nimmt nur status signed/complete und den Zeitraum', async () => {
    const { client, filter } = fakeDb([])
    await assertTarifZuordnung(client, P)
    expect(filter).toContain('in("status",["signed","complete"])')
    expect(filter).toContain('gte("date","2026-07-01")')
    expect(filter).toContain('lte("date","2026-07-31")')
    expect(filter).toContain('eq("budget_type","entlastung")')
  })

  it('rechnet den Monatsletzten richtig (Februar im Schaltjahr)', async () => {
    const { client, filter } = fakeDb([])
    await assertTarifZuordnung(client, { ...P, periodMonth: '2028-02' })
    expect(filter).toContain('lte("date","2028-02-29")')
  })

  it('ist fail-closed bei einem Lesefehler', async () => {
    const { client } = fakeDb([], { message: 'kaputt' })
    await expect(assertTarifZuordnung(client, P)).rejects.toThrow('keine Rechnung erstellt')
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('TypeScript und SQL bilden dieselbe Tabelle ab', () => {
  /**
   * Die Zuordnung existiert zweimal: als `tarifLeistungsart()` in
   * TypeScript und als `public.tarif_leistungsart()` in der Datenbank.
   * Weichen sie ab, sperrt diese Vorpruefung Rechnungen, die die RPC
   * angenommen haette — Ueber-Sperren, der schwerere Fehler.
   *
   * Die Live-Funktion wurde am 14.09.2026 aus `pg_proc` gelesen und war
   * mit der Migration zeichengleich.
   */
  const sql = funktionAusMigration(
    '20260908000000_leistungsart_tarif_mapping.sql',
    'tarif_leistungsart',
  )

  /** Die WHEN-…-THEN-Paare des CASE als Abbildung. */
  const sqlAbbildung = new Map<string, string>()
  for (const m of sql.matchAll(/WHEN\s+'([^']+)'\s+THEN\s+'([^']+)'/g)) {
    sqlAbbildung.set(m[1], m[2])
  }

  it('die Migration enthaelt ueberhaupt Paare (sonst prueft dieser Test nichts)', () => {
    expect(sqlAbbildung.size).toBeGreaterThan(15)
  })

  it('jedes SQL-Paar ergibt in TypeScript denselben Schluessel', () => {
    const abweichungen: string[] = []
    for (const [von, nach] of sqlAbbildung) {
      const ts = tarifLeistungsart(von)
      if (ts !== nach) abweichungen.push(`${von}: SQL=${nach} TS=${ts}`)
    }
    expect(abweichungen).toEqual([])
  })

  it('TypeScript ordnet nichts zu, was SQL nicht kennt', () => {
    // Die andere Richtung: ein TS-Alias ohne SQL-Gegenstueck liesse die
    // Vorpruefung durch und die RPC scheitern.
    const zusatz: string[] = []
    for (const wort of [
      'haushaltshilfe', 'hauswirtschaftliche unterstuetzung', 'einkaufshilfe',
      'einkaufsbegleitung', 'arztbegleitung', 'begleitung', 'betreuung/gesellschaft',
      'gesellschaft', 'betreuung', 'spaziergang/mobilitaet', 'spaziergang', 'mobilitaet',
      'alltagsbegleitung', 'begleitservice', 'betreuung_45a', 'demenzbetreuung',
      'einkaufsservice', 'hauswirtschaft', 'nachtbetreuung', 'wochenendbetreuung',
      'wegepauschale', 'sonstige',
    ]) {
      const ts = tarifLeistungsart(wort)
      if (ts !== null && !sqlAbbildung.has(wort)) zusatz.push(`${wort} -> ${ts}`)
    }
    expect(zusatz).toEqual([])
  })

  it('die beiden live vorkommenden Ausreisser bleiben bewusst ohne Schluessel', () => {
    // 'sonstige' traegt einen eigenen Preis (40 EUR/h); auf ihn auszuweichen
    // wuerde Koerperpflege zum Begleitungssatz abrechnen.
    expect(tarifLeistungsart('Grosse Koerperpflege')).toBeNull()
    expect(tarifLeistungsart('Medikamentengabe')).toBeNull()
    expect(sqlAbbildung.has('grosse koerperpflege')).toBe(false)
    expect(sqlAbbildung.has('medikamentengabe')).toBe(false)
  })
})

describe('der Guard sitzt am Engpass', () => {
  it('createInvoiceDraft ruft ihn — nicht nur der Sammelrechnungslauf', () => {
    const quelle = readFileSync('lib/billing/core/invoice-engine.ts', 'utf8')
    const ab = quelle.indexOf('export async function createInvoiceDraft')
    const bis = quelle.indexOf('create_invoice_draft_atomic', ab)
    expect(ab).toBeGreaterThan(-1)
    // Der Aufruf muss VOR der RPC stehen; danach existiert die Rechnung.
    expect(quelle.slice(ab, bis)).toContain('assertTarifZuordnung(')
  })

  it('die Spaltenliste nennt service_type — ohne sie prueft der Guard nichts', () => {
    expect(ZUORDNUNG_SPALTEN).toContain('service_type')
  })

  it('benutzt dieselbe Abfrage-Kette wie assertBelegteNachweise', () => {
    // Beide Guards laufen unmittelbar hintereinander gegen dieselbe
    // Tabelle. Weicht die Kette ab, prueft der eine eine andere Menge als
    // der andere — und die Attrappen der bestehenden Tests bilden nur eine
    // davon nach.
    const quelle = readFileSync('lib/billing/tarif-zuordnung.ts', 'utf8')
    const beleg = readFileSync('lib/billing/nachweis-beleg.ts', 'utf8')
    const kette = (t: string) => (t.match(/\.(select|eq|in|gte|lte|or)\(/g) ?? []).join('')
    const ab = (t: string) => t.slice(t.indexOf(".from('service_records')"))
    expect(kette(ab(quelle).slice(0, 400))).toBe(kette(ab(beleg).slice(0, 400)))
  })
})
