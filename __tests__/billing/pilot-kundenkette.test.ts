/**
 * Pilot — Kundenkette und Betriebs-Voraussetzungen
 *
 * Prüft die Bewertungslogik gegen einen Supabase-Stub. Kein Netzzugriff,
 * keine echten Kunden-/Gesundheitsdaten — alle Datensätze sind synthetisch.
 *
 * Die Suite hält vor allem die Statusfallen fest, die im Betrieb bereits
 * einmal zu falschen Aussagen geführt haben:
 *
 *   • status='signed' ohne Zeile in service_signatures ist KEINE Unterschrift.
 *   • invoices.total_amount steht in EURO, payment_allocations in CENT.
 *   • invoices führt alte ('paid','sent') und neue Statuswerte parallel —
 *     die Bezahlt-Erkennung darf nicht am Status-String hängen.
 */

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ermittleKundenKette } from '@/lib/pilot/kundenkette'
import { KETTEN_SCHRITTE } from '@/lib/pilot/schritte'
import type { SchrittId, SchrittStand } from '@/lib/pilot/types'

const ORG = '00000000-0000-4000-8000-000000000001'
const KUNDE = '11111111-1111-4111-8111-111111111111'
const ENGEL_FREI = '22222222-2222-4222-8222-222222222222'
const ENGEL_GESPERRT = '33333333-3333-4333-8333-333333333333'

const JAHR = new Date().getFullYear()

/** Was der Stub je Tabelle zurückgeben soll. */
interface Tabellen {
  clients?: Record<string, unknown>[]
  client_budgets?: Record<string, unknown>[]
  assignments?: Record<string, unknown>[]
  caregivers?: Record<string, unknown>[]
  service_records?: Record<string, unknown>[]
  service_signatures?: Record<string, unknown>[]
  invoices?: Record<string, unknown>[]
  invoice_packages?: Record<string, unknown>[]
  payment_allocations?: Record<string, unknown>[]
  datev_exports?: Record<string, unknown>[]
}

/**
 * Minimaler Supabase-Stub: sammelt .eq()/.in()/.is()-Aufrufe ein und ist
 * am Ende `await`-bar. Filtert bewusst NICHT nach — die Kettenlogik erhält
 * genau die Zeilen, die der Test vorgibt.
 */
function stub(tabellen: Tabellen): SupabaseClient {
  const client = {
    from(tabelle: keyof Tabellen) {
      const daten = tabellen[tabelle] ?? []
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        in: () => query,
        is: () => query,
        neq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => Promise.resolve({ data: daten[0] ?? null, error: null }),
        single: () => Promise.resolve({ data: daten[0] ?? null, error: null }),
        then: (aufloesen: (v: { data: unknown[]; error: null; count: number }) => unknown) =>
          Promise.resolve({ data: daten, error: null, count: daten.length }).then(aufloesen),
      }
      return query
    },
  }
  return client as unknown as SupabaseClient
}

/** Vollständige Stammdaten — Schritt 1 ist damit erledigt. */
const VOLLSTAENDIGER_KUNDE = {
  id: KUNDE,
  first_name: 'Erika',
  last_name: 'Testfall',
  geburtsdatum: '1942-03-11',
  date_of_birth: null,
  address: 'Musterweg 1',
  zip_code: '60311',
  city: 'Frankfurt am Main',
  phone: '069 000000',
  email: null,
  pflegegrad: 2,
  pflegekasse_name: null,
}

function standVon(schritte: { id: SchrittId; stand: SchrittStand }[], id: SchrittId): SchrittStand {
  const s = schritte.find(x => x.id === id)
  if (!s) throw new Error(`Schritt ${id} fehlt`)
  return s.stand
}

describe('Kettendefinition', () => {
  it('ist lückenlos von 1 bis 13 nummeriert', () => {
    const nummern = KETTEN_SCHRITTE.map(s => s.nr)
    expect(nummern).toEqual(Array.from({ length: KETTEN_SCHRITTE.length }, (_, i) => i + 1))
  })

  it('vergibt jede Schritt-ID genau einmal', () => {
    const ids = KETTEN_SCHRITTE.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('deckt die geforderte Kette vom Kunden bis DATEV ab', () => {
    const ids = KETTEN_SCHRITTE.map(s => s.id)
    expect(ids).toEqual([
      'kunde', 'pflegegrad', 'budget', 'engel', 'termin', 'leistungsnachweis',
      'signatur', 'freigabe', 'rechnung', 'pdf', 'zahlung', 'opos', 'datev',
    ])
  })
})

describe('Kundenkette — leerer Kunde', () => {
  it('meldet alles offen bzw. blockiert und nennt Schritt 2 als nächsten', async () => {
    const kette = await ermittleKundenKette(
      stub({ clients: [{ ...VOLLSTAENDIGER_KUNDE, pflegegrad: null }] }),
      ORG, KUNDE,
    )
    expect(kette).not.toBeNull()
    const s = kette!.schritte

    expect(standVon(s, 'kunde')).toBe('erledigt')
    expect(standVon(s, 'pflegegrad')).toBe('offen')
    // Ohne Pflegegrad ist das Budget nicht „offen", sondern blockiert —
    // der Admin soll nicht versuchen, es anzulegen.
    expect(standVon(s, 'budget')).toBe('blockiert')
    expect(standVon(s, 'leistungsnachweis')).toBe('blockiert')
    expect(kette!.aktuellerSchritt?.id).toBe('pflegegrad')
    expect(kette!.vollstaendig).toBe(false)
  })

  it('listet fehlende Stammdaten namentlich auf', async () => {
    const kette = await ermittleKundenKette(
      stub({ clients: [{ ...VOLLSTAENDIGER_KUNDE, address: null, phone: null, email: null }] }),
      ORG, KUNDE,
    )
    const kunde = kette!.schritte.find(x => x.id === 'kunde')!
    expect(kunde.stand).toBe('laeuft')
    expect(kunde.wert).toContain('Anschrift')
    expect(kunde.wert).toContain('Telefon oder E-Mail')
  })
})

describe('Kundenkette — Signaturen', () => {
  const basis: Tabellen = {
    clients: [VOLLSTAENDIGER_KUNDE],
    client_budgets: [{ client_id: KUNDE, budget_type: 'entlastung', year: JAHR, annual_amount: 1572 }],
    caregivers: [{ id: ENGEL_FREI }],
    assignments: [{ id: 'a1', client_id: KUNDE, caregiver_id: ENGEL_FREI, assignment_date: '2026-08-01', status: 'geplant' }],
  }

  it('wertet status="signed" OHNE service_signatures NICHT als unterschrieben', async () => {
    // Genau die Live-Konstellation: 30 Nachweise auf 'signed', 0 Signaturen.
    const kette = await ermittleKundenKette(
      stub({
        ...basis,
        service_records: [{ id: 'r1', client_id: KUNDE, status: 'signed', amount: 70, date: '2026-08-01' }],
        service_signatures: [],
      }),
      ORG, KUNDE,
    )
    const s = kette!.schritte
    expect(standVon(s, 'signatur')).toBe('offen')
    // Die Freigabe ist davon unabhängig erledigt — 'signed' ist abrechenbar.
    expect(standVon(s, 'freigabe')).toBe('erledigt')
  })

  it('meldet Teilsignierung als laufend', async () => {
    const kette = await ermittleKundenKette(
      stub({
        ...basis,
        service_records: [
          { id: 'r1', client_id: KUNDE, status: 'signed', amount: 70, date: '2026-08-01' },
          { id: 'r2', client_id: KUNDE, status: 'signed', amount: 35, date: '2026-08-02' },
        ],
        service_signatures: [{ service_record_id: 'r1', signer_role: 'client' }],
      }),
      ORG, KUNDE,
    )
    const sig = kette!.schritte.find(x => x.id === 'signatur')!
    expect(sig.stand).toBe('laeuft')
    expect(sig.wert).toBe('1 von 2 Nachweisen unterschrieben')
  })
})

describe('Kundenkette — Betreuungskraft', () => {
  it('blockiert, wenn die zugeordnete Kraft keine Einsatzfreigabe hat', async () => {
    const kette = await ermittleKundenKette(
      stub({
        clients: [VOLLSTAENDIGER_KUNDE],
        caregivers: [{ id: ENGEL_FREI }], // nur diese ist freigegeben
        assignments: [{ id: 'a1', client_id: KUNDE, caregiver_id: ENGEL_GESPERRT, assignment_date: '2026-08-01', status: 'geplant' }],
      }),
      ORG, KUNDE,
    )
    const engel = kette!.schritte.find(x => x.id === 'engel')!
    expect(engel.stand).toBe('blockiert')
    expect(engel.naechsterSchritt).toContain('keine Einsatzfreigabe')
  })
})

describe('Kundenkette — Geld', () => {
  const mitRechnung: Tabellen = {
    clients: [VOLLSTAENDIGER_KUNDE],
    client_budgets: [{ client_id: KUNDE, budget_type: 'entlastung', year: JAHR, annual_amount: 1572 }],
    caregivers: [{ id: ENGEL_FREI }],
    assignments: [{ id: 'a1', client_id: KUNDE, caregiver_id: ENGEL_FREI, assignment_date: '2026-08-01', status: 'geplant' }],
    service_records: [{ id: 'r1', client_id: KUNDE, status: 'invoiced', amount: 100, date: '2026-08-01' }],
    service_signatures: [{ service_record_id: 'r1', signer_role: 'client' }],
    invoices: [{
      id: 'i1', client_id: KUNDE, invoice_number_formatted: 'RE-2026-00001',
      invoice_number: null, status: 'sent', total_amount: 100, paid_amount: null,
      period_start: '2026-08-01', period_end: '2026-08-31', created_at: '2026-08-15T10:00:00Z',
    }],
  }

  it('rechnet Euro-Rechnungsbeträge korrekt gegen Cent-Zuordnungen auf', async () => {
    const kette = await ermittleKundenKette(
      stub({
        ...mitRechnung,
        // 100,00 € Rechnung, 10000 Cent zugeordnet → vollständig bezahlt.
        payment_allocations: [{ invoice_id: 'i1', amount_cents: 10000 }],
      }),
      ORG, KUNDE,
    )
    const s = kette!.schritte
    expect(standVon(s, 'zahlung')).toBe('erledigt')
    expect(standVon(s, 'opos')).toBe('erledigt')
    expect(s.find(x => x.id === 'opos')!.wert).toBe('keine offene Forderung')
  })

  it('meldet Teilzahlung als laufend und beziffert den offenen Rest', async () => {
    const kette = await ermittleKundenKette(
      stub({ ...mitRechnung, payment_allocations: [{ invoice_id: 'i1', amount_cents: 4000 }] }),
      ORG, KUNDE,
    )
    const s = kette!.schritte
    expect(standVon(s, 'zahlung')).toBe('laeuft')
    expect(standVon(s, 'opos')).toBe('laeuft')
    expect(s.find(x => x.id === 'opos')!.wert).toBe('60.00 € offen')
  })

  it('erkennt Altbestand über paid_amount, weist aber die fehlende Zuordnung aus', async () => {
    const kette = await ermittleKundenKette(
      stub({
        ...mitRechnung,
        invoices: [{ ...mitRechnung.invoices![0], status: 'paid', paid_amount: 100 }],
        payment_allocations: [],
      }),
      ORG, KUNDE,
    )
    const zahlung = kette!.schritte.find(x => x.id === 'zahlung')!
    expect(zahlung.stand).toBe('erledigt')
    expect(zahlung.wert).toContain('ohne Zahlungszuordnung')
  })

  it('meldet Rechnungen ohne fortlaufende Nummer als nicht abgeschlossen', async () => {
    const kette = await ermittleKundenKette(
      stub({
        ...mitRechnung,
        invoices: [{ ...mitRechnung.invoices![0], invoice_number_formatted: null, invoice_number: null }],
      }),
      ORG, KUNDE,
    )
    const rechnung = kette!.schritte.find(x => x.id === 'rechnung')!
    expect(rechnung.stand).toBe('laeuft')
    expect(rechnung.naechsterSchritt).toContain('§ 14')
  })

  it('zählt einen fehlgeschlagenen DATEV-Export nicht als Übergabe', async () => {
    const kette = await ermittleKundenKette(
      stub({
        ...mitRechnung,
        payment_allocations: [{ invoice_id: 'i1', amount_cents: 10000 }],
        datev_exports: [{ zeitraum_von: '2026-08-01', zeitraum_bis: '2026-08-31', status: 'fehler' }],
      }),
      ORG, KUNDE,
    )
    expect(standVon(kette!.schritte, 'datev')).toBe('offen')
  })

  it('erkennt einen erstellten DATEV-Export, der den Rechnungszeitraum abdeckt', async () => {
    const kette = await ermittleKundenKette(
      stub({
        ...mitRechnung,
        invoice_packages: [{ invoice_id: 'i1' }],
        payment_allocations: [{ invoice_id: 'i1', amount_cents: 10000 }],
        datev_exports: [{ zeitraum_von: '2026-08-01', zeitraum_bis: '2026-08-31', status: 'erstellt' }],
      }),
      ORG, KUNDE,
    )
    const kette2 = kette!
    expect(standVon(kette2.schritte, 'datev')).toBe('erledigt')
    expect(kette2.vollstaendig).toBe(true)
    expect(kette2.fortschritt.prozent).toBe(100)
  })
})
