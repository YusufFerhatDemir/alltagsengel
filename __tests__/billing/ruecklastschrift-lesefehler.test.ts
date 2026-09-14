/**
 * Die Schreibvorgänge waren abgesichert — die Lesevorgänge nicht
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 77)
 *
 * `verarbeiteRuecklastschrift()` ist der teuerste Pfad der Zahlungsstrecke:
 * Zahlung zurücknehmen, Rechnung wieder öffnen, Gebühr buchen, Mandat
 * sperren, Mahnstufe erhöhen. Jeder dieser SCHREIBVORGÄNGE ist vorbildlich
 * abgesichert — Fehler, getroffene Zeilen, teils ein Vergleich gegen den
 * gelesenen Stand, und jedes Scheitern landet über `meldeFehler` im
 * Ergebnis.
 *
 * Die LESEVORGÄNGE, die darüber entscheiden, ob überhaupt geschrieben
 * wird, waren es nicht. Sieben Abfragen verwarfen ihren Fehler, und jede
 * davon ließ einen ganzen Schritt still ausfallen:
 *
 *   sepa_batch_items (EndToEndId)  → fällt auf den schwächeren Rückfall
 *                                     über Mandat + Betrag durch, der
 *                                     nachweislich schon einmal die
 *                                     Rechnung eines Unbeteiligten traf
 *   sepa_mandates                  → dito
 *   payment_allocations            → Storno der Zahlung findet nicht statt
 *   payments                       → allocated_cents bleibt stehen
 *   invoices                       → Rechnung gilt weiter als bezahlt,
 *                                     obwohl das Geld zurück ist
 *   sepa_batch_items (Zählung)     → Mandat wird nicht gesperrt, der
 *                                     nächste Lauf zieht erneut ein
 *   dunning_entries                → Mahnstufe bleibt stehen
 *
 * Die Funktion fängt jede Ausnahme selbst ab und gibt ein Ergebnisobjekt
 * zurück — `fehler` ist der einzige Kanal, über den etwas davon nach außen
 * dringt. Genau der blieb leer.
 */
import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'
import { verarbeiteRuecklastschrift } from '@/lib/billing/sepa/ruecklastschrift'
import type { CamtBuchung } from '@/lib/billing/camt/camt-parser'

const ORG = 'aaaaaaaa-0000-4000-8000-00000000e101'
const ACTOR = '11111111-0000-4000-8000-00000000e101'
const INVOICE = 'cccccccc-0000-4000-8000-00000000e101'
const MANDAT = 'dddddddd-0000-4000-8000-00000000e101'
const ITEM = 'eeeeeeee-0000-4000-8000-00000000e101'

const FEHLER = { message: 'connection reset', code: '08006' }

function buchung(over: Partial<CamtBuchung> = {}): CamtBuchung {
  return {
    endToEndId: 'E2E-1',
    mandateId: 'MND-1',
    betragCent: -5000,
    buchungsdatum: '2026-09-01',
    verwendungszweck: 'RETOURE',
    zahlerName: 'Frau Beispiel',
    zahlerIban: 'DE02120300000000202051',
    ...(over as Record<string, unknown>),
  } as CamtBuchung
}

/**
 * Gesunder Durchlauf bis auf die eine Abfrage in `kaputt`.
 *
 * `nr` grenzt bei mehrfach gelesenen Tabellen den einzelnen Aufruf ab —
 * `sepa_batch_items` wird zweimal gelesen (Suche und Zählung).
 */
function fake(kaputt: { tabelle: string; nr?: number; head?: boolean } | null) {
  const stoert = (a: FakeAufruf) =>
    kaputt !== null
    && a.tabelle === kaputt.tabelle
    && a.operation === 'select'
    && (kaputt.nr === undefined || a.nr === kaputt.nr)
    && (kaputt.head === undefined || a.head === kaputt.head)

  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (stoert(a)) return { data: null, error: FEHLER, count: null }

    if (a.tabelle === 'sepa_batch_items') {
      if (a.operation === 'update') return { data: [{ id: ITEM }] }
      if (a.head) return { data: null, count: 0 }
      return { data: { id: ITEM, invoice_id: INVOICE, mandate_id: MANDAT, batch_id: 'b-1' } }
    }
    if (a.tabelle === 'sepa_mandates') {
      return a.operation === 'update' ? { data: [{ id: MANDAT }] } : { data: { id: MANDAT } }
    }
    if (a.tabelle === 'payment_allocations') {
      if (a.operation === 'select') {
        return { data: [{ id: 'alloc-1', payment_id: 'pay-1', amount_cents: 5000 }] }
      }
      return { data: [{ id: 'alloc-1' }] }
    }
    if (a.tabelle === 'payments') {
      return a.operation === 'update'
        ? { data: [{ id: 'pay-1' }] }
        : { data: { id: 'pay-1', allocated_cents: 5000 } }
    }
    if (a.tabelle === 'invoices') {
      return a.operation === 'update'
        ? { data: [{ id: INVOICE }] }
        : { data: { id: INVOICE, total_amount: 50, paid_amount: 50 } }
    }
    if (a.tabelle === 'dunning_entries') {
      return a.operation === 'update'
        ? { data: [{ id: 'dun-1' }] }
        : { data: { id: 'dun-1', dunning_level: 'offen', block_dunning: false, block_reason: null } }
    }
    return { data: null }
  })
}

async function lauf(kaputt: Parameters<typeof fake>[0], b: CamtBuchung = buchung()) {
  const f = fake(kaputt)
  const r = await verarbeiteRuecklastschrift(f.client, b, 'ze-1', ORG, ACTOR)
  return { ...r, aufrufe: f.aufrufe }
}

describe('Der gesunde Durchlauf bleibt gesund', () => {
  it('meldet keinen Fehler', async () => {
    const r = await lauf(null)
    expect(r.erkannt).toBe(true)
    expect(r.fehler).toBeNull()
  })

  it('und bucht die Gebühr', async () => {
    const r = await lauf(null)
    expect(r.gebuehrCent).toBeGreaterThan(0)
  })
})

describe('Jeder unlesbare Schritt steht im Ergebnis', () => {
  it('Lastschriftposten nicht lesbar → kein stiller Rückfall auf Mandat + Betrag', async () => {
    const r = await lauf({ tabelle: 'sepa_batch_items', nr: 0 })
    expect(r.erkannt).toBe(false)
    expect(r.fehler).toMatch(/EndToEndId/)
    expect(r.fehler).toMatch(/NICHT festgestellt/)
  })

  it('und die Suche über Mandat + Betrag findet dann gar nicht erst statt', async () => {
    // Genau dieser Rückfall hat nachweislich schon einmal die Rechnung
    // eines Unbeteiligten getroffen.
    const r = await lauf({ tabelle: 'sepa_batch_items', nr: 0 })
    expect(r.aufrufe.some(a => a.tabelle === 'sepa_mandates')).toBe(false)
  })

  it('Zahlungszuordnung nicht lesbar → Storno fand nicht statt', async () => {
    const r = await lauf({ tabelle: 'payment_allocations' })
    expect(r.fehler).toMatch(/NICHT storniert/)
  })

  it('Zahlung nicht lesbar → allocated_cents blieb stehen', async () => {
    const r = await lauf({ tabelle: 'payments' })
    expect(r.fehler).toMatch(/NICHT reduziert/)
  })

  it('Rechnung nicht lesbar → sie gilt weiter als bezahlt', async () => {
    const r = await lauf({ tabelle: 'invoices' })
    expect(r.fehler).toMatch(/gilt weiter als bezahlt/)
    expect(r.fehler).toMatch(/Geld zurück/)
  })

  it('Rücklastschriften nicht zählbar → Mandatssperre ungeprüft', async () => {
    const r = await lauf({ tabelle: 'sepa_batch_items', head: true })
    expect(r.fehler).toMatch(/NICHT geprüft, ob das Mandat zu sperren ist/)
  })

  it('Mahnvorgang nicht lesbar → Stufe blieb stehen', async () => {
    const r = await lauf({ tabelle: 'dunning_entries' })
    expect(r.fehler).toMatch(/Mahnstufe wurde NICHT erhöht/)
  })
})

describe('Was kein Fehler ist, wird auch keiner', () => {
  it('kein Mahnvorgang zur Rechnung', async () => {
    // `maybeSingle` statt `single`: ohne Mahnvorgang gibt es nichts zu
    // erhöhen. Mit `single` war genau dieser Normalfall ein PGRST116.
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'dunning_entries' && a.operation === 'select') return { data: null }
      if (a.tabelle === 'sepa_batch_items') {
        if (a.operation === 'update') return { data: [{ id: ITEM }] }
        if (a.head) return { data: null, count: 0 }
        return { data: { id: ITEM, invoice_id: INVOICE, mandate_id: MANDAT, batch_id: 'b-1' } }
      }
      if (a.tabelle === 'payment_allocations') return { data: [] }
      if (a.tabelle === 'invoices') {
        return a.operation === 'update'
          ? { data: [{ id: INVOICE }] }
          : { data: { id: INVOICE, total_amount: 50, paid_amount: 50 } }
      }
      return { data: null }
    })
    const r = await verarbeiteRuecklastschrift(f.client, buchung(), 'ze-1', ORG, ACTOR)
    // `fehler` ist hier null — das ist genau die Aussage.
    expect(r.fehler ?? '').not.toMatch(/Mahnvorgang nicht lesbar/)
  })

  it('keine Zahlungszuordnung zur Rechnung', async () => {
    const f = erstelleFakeSupabase((a: FakeAufruf) => {
      if (a.tabelle === 'payment_allocations' && a.operation === 'select') return { data: [] }
      if (a.tabelle === 'sepa_batch_items') {
        if (a.operation === 'update') return { data: [{ id: ITEM }] }
        if (a.head) return { data: null, count: 0 }
        return { data: { id: ITEM, invoice_id: INVOICE, mandate_id: MANDAT, batch_id: 'b-1' } }
      }
      if (a.tabelle === 'invoices') {
        return a.operation === 'update'
          ? { data: [{ id: INVOICE }] }
          : { data: { id: INVOICE, total_amount: 50, paid_amount: 50 } }
      }
      if (a.tabelle === 'dunning_entries') {
        return a.operation === 'update'
          ? { data: [{ id: 'dun-1' }] }
          : { data: { id: 'dun-1', dunning_level: 'offen', block_dunning: false, block_reason: null } }
      }
      return { data: null }
    })
    const r = await verarbeiteRuecklastschrift(f.client, buchung(), 'ze-1', ORG, ACTOR)
    expect(r.fehler ?? '').not.toMatch(/nicht lesbar/)
  })
})
