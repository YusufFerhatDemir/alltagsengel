/**
 * DATEV-Buchungssatz-Generator (lib/billing/datev/buchungssatz-generator.ts)
 *
 * Was hier herauskommt, geht an den Steuerberater und wird gebucht. Ein
 * Fehler faellt deshalb nicht in der Anwendung auf, sondern erst im
 * Jahresabschluss — und dann als Differenz, die jemand von Hand suchen muss.
 *
 * Drei Fehlerklassen sind hier teuer:
 *
 *   1. Ein UNVOLLSTAENDIGER Export, der wie ein vollstaendiger aussieht.
 *      Fehlen die Zahlungen, stehen alle Erloese im Buch und keine
 *      Zahlungseingaenge — die Debitorensalden sind dann durchgehend falsch.
 *   2. Ein Beleg, dessen Betrag nicht auf einem Kontoauszug steht. Gegen die
 *      Bank gebuchte Betraege muessen der tatsaechlichen Kontobewegung
 *      entsprechen, sonst geht der Bankabgleich nicht mehr auf.
 *   3. Eine Rechnung, die durch beide Abfragen faellt und in keiner Buchung
 *      landet.
 */

import { describe, it, expect } from 'vitest'
import { generateBuchungssaetze } from '@/lib/billing/datev/buchungssatz-generator'
import { formatDatevDatum } from '@/lib/billing/datev/datev-format'
import { getKonto } from '@/lib/billing/datev/kontenrahmen'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const CLIENT = '11111111-1111-4111-8111-111111111111'
const DEBITOR = '10001'

const ZEITRAUM = { organizationId: ORG, zeitraumVon: '2026-05-01', zeitraumBis: '2026-05-31', kontenrahmen: 'SKR03' as const }

/**
 * Ein Doppelgaenger fuer alle fuenf Quellen. Nicht angegebene Tabellen
 * liefern leer — so bleibt jeder Test auf genau eine Buchungsart bezogen.
 */
function fake(quellen: {
  invoices?: unknown[]
  gutschriften?: unknown[]
  payment_allocations?: unknown[]
  dunning_entries?: unknown[]
  zahlungseingaenge?: unknown[]
  fehler?: Partial<Record<string, { message: string }>>
} = {}) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    const fehler = quellen.fehler?.[a.tabelle]
    if (fehler && a.operation === 'select') return { data: null, error: fehler }

    if (a.tabelle === 'datev_kontenzuordnung') {
      return a.operation === 'insert' ? { data: null } : { data: { debitorennummer: DEBITOR } }
    }
    if (a.tabelle === 'invoices') {
      // Gutschriften-Abfrage erkennt man am in()-Filter auf correction_type.
      const istGutschrift = a.filter.some(x => x.methode === 'in' && x.spalte === 'correction_type')
      if (istGutschrift) {
        const erlaubt = (a.filter.find(x => x.methode === 'in' && x.spalte === 'correction_type')?.wert ?? []) as string[]
        return { data: (quellen.gutschriften ?? []).filter((r) =>
          erlaubt.includes(String((r as Record<string, unknown>).correction_type ?? 'gutschrift'))) }
      }
      /*
       * Der .or()-Filter der Rechnungsabfrage wird hier NACHGEBILDET, statt
       * ihn zu ignorieren. Sonst liefert der Doppelgaenger jede Rechnung
       * zurueck, egal welchen correction_type sie traegt — und ein Test, der
       * genau eine Luecke in diesem Filter sucht, waere immer gruen.
       */
      const orAusdruck = String(a.filter.find(x => x.methode === 'or')?.spalte ?? '')
      const nullErlaubt = orAusdruck.includes('correction_type.is.null')
      const erlaubteWerte = [...orAusdruck.matchAll(/correction_type\.eq\.([a-z_]+)/g)].map(m => m[1])
      return { data: (quellen.invoices ?? []).filter((r) => {
        const typ = (r as Record<string, unknown>).correction_type
        if (typ === null || typ === undefined) return nullErlaubt
        return erlaubteWerte.includes(String(typ))
      }) }
    }
    if (a.tabelle === 'payment_allocations') return { data: quellen.payment_allocations ?? [] }
    if (a.tabelle === 'dunning_entries') return { data: quellen.dunning_entries ?? [] }
    if (a.tabelle === 'zahlungseingaenge') return { data: quellen.zahlungseingaenge ?? [] }
    return { data: [] }
  })
}

// ---------------------------------------------------------------------------
// 0 — Datumsformat
// ---------------------------------------------------------------------------

describe('formatDatevDatum', () => {
  it('liefert TTMM ohne Punkt — das DATEV-Belegdatumsformat', () => {
    expect(formatDatevDatum('2026-05-07')).toBe('0705')
    expect(formatDatevDatum('2026-12-31')).toBe('3112')
  })

  it('fuehrende Nullen bleiben erhalten', () => {
    expect(formatDatevDatum('2026-01-01')).toBe('0101')
  })
})

// ---------------------------------------------------------------------------
// 1 — Fail-Closed: ein unvollstaendiger Export darf nicht wie ein voller aussehen
// ---------------------------------------------------------------------------

describe('generateBuchungssaetze — Fail-Closed auf allen fuenf Quellen', () => {
  const quellen: Array<[string, RegExp]> = [
    ['invoices', /Rechnungen|Gutschriften/],
    ['payment_allocations', /Zahlung/i],
    ['dunning_entries', /Mahngeb/i],
    ['zahlungseingaenge', /cklastschrift/i],
  ]

  for (const [tabelle, textteil] of quellen) {
    it(`Lesefehler auf ${tabelle} bricht den Export ab, statt die Buchungsart wegzulassen`, async () => {
      const f = fake({ fehler: { [tabelle]: { message: 'permission denied' } } })
      await expect(generateBuchungssaetze(f.client, ZEITRAUM)).rejects.toThrow(textteil)
    })
  }

  it('nennt im Fehlertext die Ursache, damit der Fehler nicht als leerer Monat gelesen wird', async () => {
    const f = fake({ fehler: { payment_allocations: { message: 'permission denied' } } })
    await expect(generateBuchungssaetze(f.client, ZEITRAUM)).rejects.toThrow(/permission denied/)
  })
})

// ---------------------------------------------------------------------------
// 2 — Rechnungen: Forderung an Erloes
// ---------------------------------------------------------------------------

function rechnung(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    invoice_number: 'RE-2026-0001',
    invoice_number_formatted: 'RE-2026-0001',
    total_amount: 1234.56,
    created_at: '2026-05-07T10:00:00Z',
    client_id: CLIENT,
    client: { first_name: 'Maria', last_name: 'Muster' },
    correction_type: null,
    ...ueberschreibung,
  }
}

describe('Rechnungsbuchungen', () => {
  it('bucht Debitor im Soll gegen das Erloeskonto, steuerfrei', async () => {
    const f = fake({ invoices: [rechnung()] })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)

    expect(statistik.rechnungen).toBe(1)
    expect(buchungen[0]).toMatchObject({
      umsatz: 1234.56,
      sollHaben: 'S',
      konto: DEBITOR,
      gegenkonto: getKonto('SKR03', 'erloesePflege').konto,
      belegdatum: '0705',
      belegnummer: 'RE-2026-0001',
      ustSchluessel: 0,
    })
    expect(buchungen[0].buchungstext).toContain('Muster')
  })

  it('nutzt den SKR04-Kontenrahmen, wenn er verlangt wird', async () => {
    const f = fake({ invoices: [rechnung()] })
    const { buchungen } = await generateBuchungssaetze(f.client, { ...ZEITRAUM, kontenrahmen: 'SKR04' })
    expect(buchungen[0].gegenkonto).toBe(getKonto('SKR04', 'erloesePflege').konto)
    expect(buchungen[0].gegenkonto).toBe('4120')
  })

  it('grenzt auf Mandant und Zeitraum ab und laesst Entwuerfe und Geloeschte aus', async () => {
    const f = fake({ invoices: [rechnung()] })
    await generateBuchungssaetze(f.client, ZEITRAUM)
    const a = f.auf('invoices').find(x => !x.filter.some(y => y.methode === 'in' && y.spalte === 'correction_type'))
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'gte', 'created_at', '2026-05-01T00:00:00')).toBe(true)
    expect(hatFilter(a, 'lte', 'created_at', '2026-05-31T23:59:59')).toBe(true)
    expect(hatFilter(a, 'is', 'deleted_at', null)).toBe(true)
    expect(hatFilter(a, 'not', 'status')).toBe(true)
  })

  it('ueberspringt betragslose Rechnungen', async () => {
    const f = fake({ invoices: [rechnung({ total_amount: 0 }), rechnung({ id: 'b', total_amount: null })] })
    const { statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.rechnungen).toBe(0)
  })

  it('faellt auf die unformatierte Rechnungsnummer zurueck, sonst auf den ID-Anfang', async () => {
    const f = fake({
      invoices: [
        rechnung({ id: 'a1', invoice_number_formatted: null }),
        rechnung({ id: 'abcdefgh-2222-4222-8222-222222222222', invoice_number_formatted: null, invoice_number: null }),
      ],
    })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].belegnummer).toBe('RE-2026-0001')
    expect(buchungen[1].belegnummer).toBe('abcdefgh')
  })

  it('kuerzt den Buchungstext auf die DATEV-Grenze von 60 Zeichen', async () => {
    const f = fake({
      invoices: [rechnung({ client: { first_name: 'X', last_name: 'M'.repeat(120) } })],
    })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].buchungstext.length).toBeLessThanOrEqual(60)
  })

  it('kommt ohne Klienten-Join aus, statt "undefined" in den Buchungstext zu schreiben', async () => {
    const f = fake({ invoices: [rechnung({ client: null })] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].buchungstext).toBe('Rechnung RE-2026-0001')
    expect(buchungen[0].buchungstext).not.toContain('undefined')
  })

  /**
   * BEFUND — Korrekturrechnungen fielen durch beide Abfragen.
   *
   * `invoices.correction_type` kennt live die Werte null, 'rechnung',
   * 'korrektur', 'gutschrift', 'storno' und 'teilstorno'. Die
   * Rechnungsabfrage nahm null und 'rechnung', die Gutschriftabfrage
   * 'gutschrift', 'storno' und 'teilstorno' — 'korrektur' nahm keine von
   * beiden.
   *
   * Solche Rechnungen sind keine Randfaelle: createCorrectionInvoice()
   * (lib/billing/core/invoice-engine.ts) legt sie als vollwertige
   * Ausgangsrechnung mit eigener Nummer und eigenem total_amount an. Sie
   * fehlten im Export vollstaendig — der Erloes wurde nie gebucht.
   */
  it('bucht Korrekturrechnungen als Ausgangsrechnung — sie tragen Erloes', async () => {
    const f = fake({ invoices: [rechnung({ correction_type: 'korrektur', total_amount: 500 })] })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.rechnungen).toBe(1)
    expect(buchungen[0].umsatz).toBe(500)
    expect(buchungen[0].gegenkonto).toBe(getKonto('SKR03', 'erloesePflege').konto)
  })

  it('die Rechnungsabfrage laesst Gutschriften und Stornos aus — die laufen ueber ihren eigenen Weg', async () => {
    const f = fake({ invoices: [rechnung()] })
    await generateBuchungssaetze(f.client, ZEITRAUM)
    const a = f.auf('invoices').find(x => x.filter.some(y => y.methode === 'or'))
    const orFilter = String(a?.filter.find(y => y.methode === 'or')?.spalte ?? '')
    expect(orFilter).toContain('correction_type')
    for (const belegart of ['gutschrift', 'storno', 'teilstorno']) {
      expect(orFilter).not.toContain(`eq.${belegart}`)
    }
  })
})

// ---------------------------------------------------------------------------
// 3 — Gutschriften: Erloes an Debitor
// ---------------------------------------------------------------------------

describe('Gutschriftbuchungen', () => {
  function gutschrift(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: 'bbbbbbbb-1111-4111-8111-111111111111',
      invoice_number: 'GS-2026-0001',
      invoice_number_formatted: 'GS-2026-0001',
      total_amount: 200,
      created_at: '2026-05-12T10:00:00Z',
      client_id: CLIENT,
      client: { last_name: 'Muster' },
      ...ueberschreibung,
    }
  }

  it('bucht Erloes im Soll gegen den Debitor und setzt das Storno-Kennzeichen', async () => {
    const f = fake({ gutschriften: [gutschrift()] })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.gutschriften).toBe(1)
    expect(buchungen[0]).toMatchObject({
      umsatz: 200,
      sollHaben: 'S',
      konto: getKonto('SKR03', 'erloesePflege').konto,
      gegenkonto: DEBITOR,
      belegdatum: '1205',
      storno: true,
      ustSchluessel: 0,
    })
  })

  it('bucht eine negativ gefuehrte Gutschrift mit positivem Betrag — die Richtung steckt in Soll/Haben', async () => {
    const f = fake({ gutschriften: [gutschrift({ total_amount: -200 })] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].umsatz).toBe(200)
  })

  it('holt genau die drei Gutschrift-Belegarten', async () => {
    const f = fake({ gutschriften: [gutschrift()] })
    await generateBuchungssaetze(f.client, ZEITRAUM)
    const a = f.auf('invoices').find(x => x.filter.some(y => y.methode === 'in' && y.spalte === 'correction_type'))
    expect(hatFilter(a, 'in', 'correction_type', ['gutschrift', 'storno', 'teilstorno'])).toBe(true)
    expect(hatOrgFence(a, ORG)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4 — Zahlungen: Bank an Debitor
// ---------------------------------------------------------------------------

describe('Zahlungsbuchungen', () => {
  function allocation(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: 'alloc-1',
      amount_cents: 123456,
      created_at: '2026-05-15T10:00:00Z',
      payment: { payment_date: '2026-05-14' },
      invoice: { id: 'inv-1', invoice_number: 'RE-2026-0001', invoice_number_formatted: 'RE-2026-0001', client_id: CLIENT, client: { last_name: 'Muster' } },
      ...ueberschreibung,
    }
  }

  it('bucht Bank im Soll gegen den Debitor und rechnet Cent in Euro um', async () => {
    const f = fake({ payment_allocations: [allocation()] })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.zahlungen).toBe(1)
    expect(buchungen[0]).toMatchObject({
      umsatz: 1234.56,
      sollHaben: 'S',
      konto: getKonto('SKR03', 'bank').konto,
      gegenkonto: DEBITOR,
      belegnummer: 'RE-2026-0001',
    })
  })

  it('datiert die Buchung auf den Zahlungstag, nicht auf den Zuordnungstag', async () => {
    const f = fake({ payment_allocations: [allocation()] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].belegdatum).toBe(formatDatevDatum('2026-05-14'))
  })

  it('faellt ohne Zahlungsdatum auf den Zuordnungstag zurueck', async () => {
    const f = fake({ payment_allocations: [allocation({ payment: null })] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].belegdatum).toBe(formatDatevDatum('2026-05-15'))
  })

  it('ueberspringt Zuordnungen ohne Rechnung — ohne Debitor waere die Gegenbuchung geraten', async () => {
    const f = fake({ payment_allocations: [allocation({ invoice: null })] })
    const { statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.zahlungen).toBe(0)
  })

  it('ueberspringt betragslose und negative Zuordnungen', async () => {
    const f = fake({ payment_allocations: [allocation({ amount_cents: 0 }), allocation({ amount_cents: -500 })] })
    const { statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.zahlungen).toBe(0)
  })

  it('loest den Rechnungs-Join auf, auch wenn PostgREST ihn als Array liefert', async () => {
    const f = fake({
      payment_allocations: [allocation({
        invoice: [{ id: 'inv-1', invoice_number_formatted: 'RE-2026-0009', client_id: CLIENT, client: [{ last_name: 'Muster' }] }],
        payment: [{ payment_date: '2026-05-14' }],
      })],
    })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].belegnummer).toBe('RE-2026-0009')
    expect(buchungen[0].buchungstext).toContain('Muster')
  })

  it('grenzt auf den Mandanten und den Zeitraum ab', async () => {
    const f = fake({ payment_allocations: [allocation()] })
    await generateBuchungssaetze(f.client, ZEITRAUM)
    const a = f.ersterAuf('payment_allocations')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'gte', 'created_at', '2026-05-01T00:00:00')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5 — Mahngebuehren: Debitor an Mahnerloes
// ---------------------------------------------------------------------------

describe('Mahngebuehrbuchungen', () => {
  function mahnung(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: 'cccccccc-1111-4111-8111-111111111111',
      dunning_fee_cents: 500,
      created_at: '2026-05-20T10:00:00Z',
      dunning_level: 2,
      invoice: { id: 'inv-1', invoice_number_formatted: 'RE-2026-0001', client_id: CLIENT, client: { last_name: 'Muster' } },
      ...ueberschreibung,
    }
  }

  it('bucht den Debitor im Soll gegen das Mahnerloeskonto', async () => {
    const f = fake({ dunning_entries: [mahnung()] })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.mahngebuehren).toBe(1)
    expect(buchungen[0]).toMatchObject({
      umsatz: 5,
      sollHaben: 'S',
      konto: DEBITOR,
      gegenkonto: getKonto('SKR03', 'mahngebuehren').konto,
      belegnummer: 'RE-2026-0001',
    })
    expect(buchungen[0].buchungstext).toContain('Mahngebuehr')
  })

  /** Regressionsschutz: die Spalte heisst dunning_fee_cents, nicht gebuehr_cents. */
  it('liest die Gebuehr aus dunning_fee_cents und holt nur Mahnungen mit Gebuehr', async () => {
    const f = fake({ dunning_entries: [mahnung()] })
    await generateBuchungssaetze(f.client, ZEITRAUM)
    const a = f.ersterAuf('dunning_entries')
    expect(a?.spalten).toContain('dunning_fee_cents')
    expect(hatFilter(a, 'gt', 'dunning_fee_cents', 0)).toBe(true)
    expect(hatOrgFence(a, ORG)).toBe(true)
  })

  it('ueberspringt Mahnungen ohne Rechnungsbezug', async () => {
    const f = fake({ dunning_entries: [mahnung({ invoice: null })] })
    const { statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.mahngebuehren).toBe(0)
  })

  it('bildet ohne Rechnungsnummer eine eigene Belegnummer, statt sie leer zu lassen', async () => {
    const f = fake({
      dunning_entries: [mahnung({ invoice: { id: 'inv-1', invoice_number_formatted: null, client_id: CLIENT, client: null } })],
    })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].belegnummer).toMatch(/^MAHN-/)
  })
})

// ---------------------------------------------------------------------------
// 6 — Ruecklastschriften
// ---------------------------------------------------------------------------

describe('Ruecklastschriftbuchungen', () => {
  function ruecklastschrift(ueberschreibung: Record<string, unknown> = {}) {
    return {
      id: 'dddddddd-1111-4111-8111-111111111111',
      betrag_cent: -12000,
      buchungsdatum: '2026-05-22',
      debitor_name: 'Muster',
      verwendungszweck: 'RE-2026-0001',
      payment: {
        id: 'pay-1', amount_cents: 12000,
        allocations: [{ invoice: { id: 'inv-1', client_id: CLIENT, invoice_number_formatted: 'RE-2026-0001' } }],
      },
      ...ueberschreibung,
    }
  }

  it('bucht die Forderung im Soll gegen die Bank — die Zahlung wird zurueckgedreht', async () => {
    const f = fake({ zahlungseingaenge: [ruecklastschrift()] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0]).toMatchObject({
      umsatz: 120,
      sollHaben: 'S',
      konto: DEBITOR,
      gegenkonto: getKonto('SKR03', 'bank').konto,
      belegdatum: '2205',
      belegnummer: 'RE-2026-0001',
    })
  })

  it('holt nur echte Ruecklastschriften des Mandanten im Zeitraum', async () => {
    const f = fake({ zahlungseingaenge: [ruecklastschrift()] })
    await generateBuchungssaetze(f.client, ZEITRAUM)
    const a = f.ersterAuf('zahlungseingaenge')
    expect(hatFilter(a, 'eq', 'ist_ruecklastschrift', true)).toBe(true)
    expect(hatFilter(a, 'gte', 'buchungsdatum', '2026-05-01')).toBe(true)
    expect(hatFilter(a, 'lte', 'buchungsdatum', '2026-05-31')).toBe(true)
    expect(hatOrgFence(a, ORG)).toBe(true)
  })

  it('faellt ohne aufloesbare Rechnung auf das Sammel-Forderungskonto zurueck', async () => {
    const f = fake({ zahlungseingaenge: [ruecklastschrift({ payment: null })] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen[0].konto).toBe(getKonto('SKR03', 'forderungen').konto)
    expect(buchungen[0].belegnummer).toMatch(/^RL-/)
  })

  /**
   * BEFUND — erfundener Betrag gegen die Bank.
   *
   * Zu jeder Ruecklastschrift wurde zusaetzlich eine Gebuehr von pauschal
   * 5,00 EUR als "Nebenkosten Geldverkehr an Bank" gebucht. Dieser Betrag
   * stand nirgends in den Daten: er war als Literal im Generator
   * hinterlegt, unabhaengig davon, ob und in welcher Hoehe die Bank
   * ueberhaupt etwas berechnet hat.
   *
   * Gegen die Bank darf nur gebucht werden, was auf dem Kontoauszug steht.
   * Jede Ruecklastschrift verschob das Bankkonto sonst um 5,00 EUR gegen
   * den Auszug — bei 20 Ruecklastschriften im Monat 100 EUR Differenz, die
   * im Bankabgleich von Hand gesucht werden muss.
   *
   * Zu unterscheiden davon ist die Gebuehr, die WIR dem Kunden berechnen:
   * die bucht lib/billing/sepa/ruecklastschrift.ts nach
   * payment_differences und ist ein anderer Vorgang. Berechnet die Bank
   * tatsaechlich etwas, erscheint das als eigene Zeile in
   * zahlungseingaenge und wird von dort gebucht — nicht geschaetzt.
   */
  it('bucht keine erfundene Gebuehr gegen die Bank', async () => {
    const f = fake({ zahlungseingaenge: [ruecklastschrift()] })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)

    expect(statistik.ruecklastschriften).toBe(1)
    expect(buchungen).toHaveLength(1)
    expect(buchungen.some(b => b.konto === getKonto('SKR03', 'nebenkostenGeldverkehr').konto)).toBe(false)
    expect(buchungen.some(b => b.umsatz === 5)).toBe(false)
  })

  it('die Summe der Bank-Gegenbuchungen entspricht der tatsaechlichen Kontobewegung', async () => {
    const f = fake({ zahlungseingaenge: [ruecklastschrift({ betrag_cent: -8750 })] })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    const bank = getKonto('SKR03', 'bank').konto
    const gegenBank = buchungen.filter(b => b.gegenkonto === bank).reduce((s, b) => s + b.umsatz, 0)
    expect(gegenBank).toBe(87.5)
  })

  it('ueberspringt betragslose Ruecklastschriften', async () => {
    const f = fake({ zahlungseingaenge: [ruecklastschrift({ betrag_cent: 0 })] })
    const { statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(statistik.ruecklastschriften).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7 — Gesamtlauf
// ---------------------------------------------------------------------------

describe('generateBuchungssaetze — Gesamtlauf', () => {
  it('summiert die Statistik ueber alle Buchungsarten', async () => {
    const f = fake({
      invoices: [rechnung()],
      gutschriften: [{ id: 'g1', invoice_number_formatted: 'GS-1', total_amount: 50, created_at: '2026-05-12T10:00:00Z', client_id: CLIENT, client: { last_name: 'M' } }],
      payment_allocations: [{ id: 'a1', amount_cents: 5000, created_at: '2026-05-15T10:00:00Z', payment: { payment_date: '2026-05-14' }, invoice: { id: 'i1', invoice_number_formatted: 'RE-1', client_id: CLIENT, client: { last_name: 'M' } } }],
      dunning_entries: [{ id: 'd1', dunning_fee_cents: 500, created_at: '2026-05-20T10:00:00Z', dunning_level: 1, invoice: { id: 'i1', invoice_number_formatted: 'RE-1', client_id: CLIENT, client: { last_name: 'M' } } }],
      zahlungseingaenge: [{ id: 'z1', betrag_cent: -5000, buchungsdatum: '2026-05-22', debitor_name: 'M', payment: null }],
    })
    const { buchungen, statistik } = await generateBuchungssaetze(f.client, ZEITRAUM)

    expect(statistik).toMatchObject({ rechnungen: 1, zahlungen: 1, gutschriften: 1, mahngebuehren: 1, ruecklastschriften: 1 })
    expect(statistik.gesamt).toBe(buchungen.length)
  })

  it('liefert einen leeren Stapel ohne Daten — und keine Buchung ohne Beleg', async () => {
    const { buchungen, statistik } = await generateBuchungssaetze(fake().client, ZEITRAUM)
    expect(buchungen).toEqual([])
    expect(statistik.gesamt).toBe(0)
  })

  it('jede Buchung traegt Konto, Gegenkonto, Belegdatum und einen positiven Betrag', async () => {
    const f = fake({
      invoices: [rechnung()],
      payment_allocations: [{ id: 'a1', amount_cents: 5000, created_at: '2026-05-15T10:00:00Z', payment: { payment_date: '2026-05-14' }, invoice: { id: 'i1', invoice_number_formatted: 'RE-1', client_id: CLIENT, client: { last_name: 'M' } } }],
    })
    const { buchungen } = await generateBuchungssaetze(f.client, ZEITRAUM)
    expect(buchungen.length).toBeGreaterThan(0)
    for (const b of buchungen) {
      expect(b.umsatz, JSON.stringify(b)).toBeGreaterThan(0)
      expect(b.konto).toBeTruthy()
      expect(b.gegenkonto).toBeTruthy()
      expect(b.konto).not.toBe(b.gegenkonto)
      expect(b.belegdatum).toMatch(/^\d{4}$/)
      expect(['S', 'H']).toContain(b.sollHaben)
    }
  })
})
