// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION-GATE — ein Token für genau EINE Zuordnung
//
// Was hier geprüft wird, und warum es sonst niemand prüft:
//
//   1. JEDER DER ZEHN PUNKTE SPERRT EINZELN. Ein Gate, bei dem ein Punkt
//      nur mitläuft, ohne je zu greifen, ist ein Punkt zu viel im Bericht
//      und einer zu wenig in der Sicherheit.
//   2. EIN NICHT GESETZTER PUNKT GILT ALS GESPERRT. Fail-closed: ein Gate,
//      das mittendrin abbricht, darf nicht wie ein bestandenes aussehen.
//   3. DAS TOKEN IST EINMALIG UND GEBUNDEN. Es deckt genau eine
//      Kombination aus Mandant, Zahlung, Rechnung und Betrag — und nach
//      der Einlösung ist es weg.
//   4. BEIM EINLÖSEN WIRD ERNEUT VOLLSTÄNDIG GEPRÜFT. Zwischen Freigabe
//      und Buchung können Minuten liegen.
//   5. ES BUCHT NICHT. Das Modul schreibt ausschliesslich in den
//      Audit-Trail — nie in payments, invoices oder payment_allocations.
//
// Der Doppelgänger aus `__tests__/helpers/supabase-fake.ts` protokolliert
// jeden Aufruf mit allen Filtern; genau deshalb ist (5) überhaupt prüfbar.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  pruefeZuordnung,
  oeffneAllocationGate,
  loeseAllocationGateEin,
  gateBerichtText,
  allocationIdempotencyKey,
  TOKEN_GUELTIG_MINUTEN,
  AKTION_GEOEFFNET,
  AKTION_EINGELOEST,
  type OeffneGateParams,
} from '@/lib/pilot/allocation-gate'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const FREMD = '22222222-2222-4222-8222-222222222222'
const ZAHLUNG = '33333333-3333-4333-8333-333333333333'
const RECHNUNG = '44444444-4444-4444-8444-444444444444'
const KUNDE = '55555555-5555-4555-8555-555555555555'
const ANDERER_KUNDE = '66666666-6666-4666-8666-666666666666'
const ADMIN = '77777777-7777-4777-8777-777777777777'

// ---------------------------------------------------------------------------
// Ausgangslage
// ---------------------------------------------------------------------------

interface Lage {
  zahlung?: Record<string, unknown> | null
  zahlungFehler?: { message: string; code?: string }
  rechnung?: Record<string, unknown> | null
  rechnungFehler?: { message: string; code?: string }
  bestehendeZuordnungen?: { id: string; amount_cents: number; allocation_type: string; allocated_at: string }[]
  auditZeilen?: { id: string; action: string; new_state: Record<string, unknown> | null; created_at: string }[]
  auditFehler?: { message: string }
  auditInsertFehler?: { message: string; code?: string }
}

const STANDARD_ZAHLUNG = {
  id: ZAHLUNG,
  organization_id: ORG,
  amount_cents: 15050,
  allocated_cents: 0,
  payment_date: '2026-08-20',
  payer_name: 'Erika Mustermann',
  deleted_at: null,
}

const STANDARD_RECHNUNG = {
  id: RECHNUNG,
  organization_id: ORG,
  invoice_number: 'RE-2026-0001',
  invoice_number_formatted: 'RE-2026-0001',
  status: 'versendet',
  total_amount: 150.5,
  paid_amount: 0,
  client_id: KUNDE,
  deleted_at: null,
  client: { first_name: 'Erika', last_name: 'Mustermann' },
}

/**
 * Bildet die `action`-Filter der Abfrage nach (`eq` und `in`).
 *
 * PostgREST filtert serverseitig; ein Doppelgaenger, der alle Zeilen
 * zurueckgibt, prueft eine Lage, die es nie gibt.
 */
function nachAktionGefiltert(
  zeilen: { action: string }[],
  a: FakeAufruf,
): { action: string }[] {
  const eq = a.filter.find(f => f.methode === 'eq' && f.spalte === 'action')
  if (eq) return zeilen.filter(z => z.action === eq.wert)
  const drin = a.filter.find(f => f.methode === 'in' && f.spalte === 'action')
  if (drin) {
    const erlaubt = new Set(drin.wert as string[])
    return zeilen.filter(z => erlaubt.has(z.action))
  }
  return zeilen
}

function fake(lage: Lage = {}) {
  return erstelleFakeSupabase((a: FakeAufruf) => {
    switch (a.tabelle) {
      case 'payments':
        if (lage.zahlungFehler) return { error: lage.zahlungFehler }
        return { data: lage.zahlung === undefined ? STANDARD_ZAHLUNG : lage.zahlung }

      case 'invoices':
        if (lage.rechnungFehler) return { error: lage.rechnungFehler }
        return { data: lage.rechnung === undefined ? STANDARD_RECHNUNG : lage.rechnung }

      case 'payment_allocations':
        return { data: lage.bestehendeZuordnungen ?? [] }

      case 'billing_audit_trail': {
        if (a.operation === 'insert') {
          if (lage.auditInsertFehler) return { error: lage.auditInsertFehler }
          return { data: { id: 'audit-1' } }
        }
        if (lage.auditFehler) return { error: lage.auditFehler }
        // Der `action`-Filter wird hier NACHGEBILDET und nicht verschluckt.
        //
        // Ohne ihn liefert der Doppelgaenger auch die 'gate_geoeffnet'-Zeile
        // an eine Abfrage, die nur nach 'gate_eingeloest' gefragt hat — und
        // der Pruefling haelt sein eigenes offenes Token fuer eine bereits
        // erfolgte Einloesung. Ein Doppelgaenger, der Filter ignoriert,
        // erzeugt genau die Fehlalarme, die er finden soll.
        return { data: nachAktionGefiltert(lage.auditZeilen ?? [], a) }
      }

      default:
        return { data: [] }
    }
  })
}

const BASIS: OeffneGateParams = {
  organizationId: ORG,
  paymentId: ZAHLUNG,
  invoiceId: RECHNUNG,
  betragCent: 15050,
  actorId: ADMIN,
}

async function pruefe(lage: Lage = {}, zusatz: Partial<OeffneGateParams> = {}) {
  const f = fake(lage)
  const e = await pruefeZuordnung(f.client as unknown as SupabaseClient, { ...BASIS, ...zusatz })
  return { e, f }
}

/** Der Befund genau eines Punkts. */
function punkt(e: Awaited<ReturnType<typeof pruefe>>['e'], nr: number) {
  return e.punkte.find(p => p.nummer === nr)!
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Grundstruktur
// ═══════════════════════════════════════════════════════════════════════

describe('Struktur', () => {
  it('liefert immer alle zehn Punkte, auch die freien', async () => {
    const { e } = await pruefe()
    expect(e.punkte.map(p => p.nummer)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('bei sauberer Lage: FREIGEGEBEN mit Token und Ablaufzeit', async () => {
    const f = fake()
    const e = await oeffneAllocationGate(f.client as unknown as SupabaseClient, BASIS)
    expect(e.status).toBe('FREIGEGEBEN')
    expect(e.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(new Date(e.gueltigBis!).getTime()).toBeGreaterThan(Date.now())
    expect(new Date(e.gueltigBis!).getTime()).toBeLessThanOrEqual(
      Date.now() + TOKEN_GUELTIG_MINUTEN * 60_000 + 1000)
  })

  it('pruefeZuordnung gibt NIE ein Token aus — auch bei sauberer Lage nicht', async () => {
    const { e } = await pruefe()
    expect(e.status).toBe('FREIGEGEBEN')
    expect(e.token).toBeNull()
    expect(e.gueltigBis).toBeNull()
  })

  it('trägt die Beträge beider Seiten für die Gegenzeichnung', async () => {
    const { e } = await pruefe()
    expect(e.rechnungGesamtCent).toBe(15050)
    expect(e.rechnungOffenCent).toBe(15050)
    expect(e.zahlungBetragCent).toBe(15050)
    expect(e.zahlungRestCent).toBe(15050)
    expect(e.zuordnungsArt).toBe('vollzahlung')
    expect(e.invoiceNumber).toBe('RE-2026-0001')
    expect(e.kundeName).toBe('Erika Mustermann')
    expect(e.zahlerName).toBe('Erika Mustermann')
  })

  it('der Idempotenzschlüssel bildet UNIQUE(payment_id, invoice_id) ab — ohne Betrag', () => {
    expect(allocationIdempotencyKey('p', 'i')).toBe('alloc_p_i')
    // Zwei verschiedene Beträge derselben Kombination ergeben DENSELBEN
    // Schlüssel: eine zweite Zuordnung ist auch dann eine Doppelbuchung.
    expect(allocationIdempotencyKey(ZAHLUNG, RECHNUNG))
      .toBe(allocationIdempotencyKey(ZAHLUNG, RECHNUNG))
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2. Jeder Punkt sperrt einzeln
// ═══════════════════════════════════════════════════════════════════════

describe('Punkt 1 — Zahlung', () => {
  it('sperrt, wenn die Zahlung nicht existiert', async () => {
    const { e } = await pruefe({ zahlung: null })
    expect(e.status).toBe('GESPERRT')
    expect(punkt(e, 1).stand).toBe('gesperrt')
  })

  it('sperrt bei Lesefehler — nicht lesbar ist nicht frei', async () => {
    const { e } = await pruefe({ zahlungFehler: { message: 'Verbindung abgebrochen' } })
    expect(e.status).toBe('GESPERRT')
    expect(e.punkte.every(p => p.stand === 'gesperrt')).toBe(true)
    expect(punkt(e, 1).befund).toContain('Verbindung abgebrochen')
  })

  it('sperrt bei gelöschter Zahlung', async () => {
    const { e } = await pruefe({ zahlung: { ...STANDARD_ZAHLUNG, deleted_at: '2026-08-21T10:00:00Z' } })
    expect(punkt(e, 1).stand).toBe('gesperrt')
  })

  it('liest die Zahlung mit Mandantenzaun', async () => {
    const { f } = await pruefe()
    const a = f.ersterAuf('payments', 'select')
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'id', ZAHLUNG)).toBe(true)
  })
})

describe('Punkt 2/3 — Rechnung und Mandant', () => {
  it('sperrt, wenn die Rechnung nicht existiert', async () => {
    const { e } = await pruefe({ rechnung: null })
    expect(punkt(e, 2).stand).toBe('gesperrt')
    expect(punkt(e, 3).stand).toBe('gesperrt')
  })

  it('sperrt bei gelöschter Rechnung', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, deleted_at: '2026-08-22' } })
    expect(punkt(e, 2).stand).toBe('gesperrt')
  })

  it('sperrt, wenn die Rechnung einem ANDEREN Mandanten gehört', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, organization_id: FREMD } })
    expect(punkt(e, 3).stand).toBe('gesperrt')
    expect(punkt(e, 3).befund).toContain('ANDEREN Mandanten')
    expect(e.status).toBe('GESPERRT')
  })

  it('liest die Rechnung bewusst OHNE org-Filter — sonst wäre "fremd" nicht von "fehlt" zu trennen', async () => {
    const { f } = await pruefe()
    const a = f.ersterAuf('invoices', 'select')
    expect(hatFilter(a, 'eq', 'id', RECHNUNG)).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(false)
    // …und wertet dafür die Spalte aus.
    expect(a?.spalten).toContain('organization_id')
  })
})

describe('Punkt 4 — Kunde', () => {
  it('sperrt bei falschem erwartetem Kunden', async () => {
    const { e } = await pruefe({}, { erwarteterClientId: ANDERER_KUNDE })
    expect(punkt(e, 4).stand).toBe('gesperrt')
    expect(e.status).toBe('GESPERRT')
  })

  it('ist frei beim richtigen Kunden', async () => {
    const { e } = await pruefe({}, { erwarteterClientId: KUNDE })
    expect(punkt(e, 4).stand).toBe('frei')
  })

  it('sagt ausdrücklich, dass NICHT geprüft wurde, wenn kein Kunde übergeben ist', async () => {
    const { e } = await pruefe()
    expect(punkt(e, 4).stand).toBe('frei')
    expect(punkt(e, 4).befund).toContain('NICHT gegengeprüft')
  })
})

describe('Punkt 5 — Betrag', () => {
  it('sperrt bei 0', async () => {
    const { e } = await pruefe({}, { betragCent: 0 })
    expect(punkt(e, 5).stand).toBe('gesperrt')
  })

  it('sperrt bei negativem Betrag', async () => {
    const { e } = await pruefe({}, { betragCent: -100 })
    expect(punkt(e, 5).stand).toBe('gesperrt')
  })

  it('sperrt bei Nachkommastellen — Cent sind ganze Zahlen', async () => {
    const { e } = await pruefe({}, { betragCent: 150.5 })
    expect(punkt(e, 5).stand).toBe('gesperrt')
    expect(punkt(e, 5).befund).toContain('ganze Zahl')
  })
})

describe('Punkt 6 — Rest der Zahlung', () => {
  it('sperrt, wenn die Zahlung schon vollständig zugeordnet ist', async () => {
    const { e } = await pruefe({ zahlung: { ...STANDARD_ZAHLUNG, allocated_cents: 15050 } })
    expect(punkt(e, 6).stand).toBe('gesperrt')
  })

  it('sperrt, wenn der Betrag den Rest übersteigt', async () => {
    const { e } = await pruefe({ zahlung: { ...STANDARD_ZAHLUNG, allocated_cents: 10000 } })
    expect(punkt(e, 6).stand).toBe('gesperrt')
    expect(punkt(e, 6).befund).toContain('50,50')
  })

  it('ist frei bei ausreichendem Rest', async () => {
    const { e } = await pruefe(
      { zahlung: { ...STANDARD_ZAHLUNG, amount_cents: 30000, allocated_cents: 10000 } })
    expect(punkt(e, 6).stand).toBe('frei')
  })
})

describe('Punkt 7 — Rest der Rechnung', () => {
  it('sperrt im Endstatus "bezahlt"', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, status: 'bezahlt' } })
    expect(punkt(e, 7).stand).toBe('gesperrt')
    expect(punkt(e, 7).befund).toContain('Endstatus')
  })

  it('sperrt im Endstatus "storniert"', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, status: 'storniert' } })
    expect(punkt(e, 7).stand).toBe('gesperrt')
  })

  it('sperrt, wenn nichts mehr offen ist', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, status: 'teilweise_bezahlt', paid_amount: 150.5 } })
    expect(punkt(e, 7).stand).toBe('gesperrt')
  })

  it('sperrt bei Überzahlung — die gehört nicht über dieses Gate', async () => {
    const { e } = await pruefe(
      { zahlung: { ...STANDARD_ZAHLUNG, amount_cents: 20000 } },
      { betragCent: 20000 },
    )
    expect(punkt(e, 7).stand).toBe('gesperrt')
    expect(punkt(e, 7).befund).toContain('Überzahlung')
  })

  it('erkennt eine Teilzahlung als solche und nennt den Rest', async () => {
    const { e } = await pruefe({}, { betragCent: 5000 })
    expect(punkt(e, 7).stand).toBe('frei')
    expect(e.zuordnungsArt).toBe('teilzahlung')
    expect(punkt(e, 7).befund).toContain('100,50')
  })

  it('eine Zahlung, die den Rest genau deckt, ist eine Vollzahlung', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, paid_amount: 100.5 } }, { betragCent: 5000 })
    expect(e.zuordnungsArt).toBe('vollzahlung')
  })
})

describe('Punkt 8 — bestehende Zuordnung', () => {
  it('sperrt, wenn es sie schon gibt', async () => {
    const { e } = await pruefe({
      bestehendeZuordnungen: [
        { id: 'alloc-1', amount_cents: 15050, allocation_type: 'vollzahlung', allocated_at: '2026-08-21' },
      ],
    })
    expect(punkt(e, 8).stand).toBe('gesperrt')
    expect(punkt(e, 8).befund).toContain('23505')
  })

  it('fragt mit Mandantenzaun UND beiden Fremdschlüsseln', async () => {
    const { f } = await pruefe()
    const a = f.ersterAuf('payment_allocations', 'select')
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'payment_id', ZAHLUNG)).toBe(true)
    expect(hatFilter(a, 'eq', 'invoice_id', RECHNUNG)).toBe(true)
  })
})

describe('Punkt 9/10 — Idempotenz und Audit', () => {
  it('sperrt, wenn derselbe Schlüssel schon eingelöst wurde', async () => {
    const { e } = await pruefe({
      auditZeilen: [{
        id: 'a1',
        action: AKTION_EINGELOEST,
        new_state: { idempotency_key: allocationIdempotencyKey(ZAHLUNG, RECHNUNG) },
        created_at: '2026-08-21T12:00:00Z',
      }],
    })
    expect(punkt(e, 9).stand).toBe('gesperrt')
    expect(e.status).toBe('GESPERRT')
  })

  it('eine Einlösung mit ANDEREM Schlüssel sperrt nicht', async () => {
    const { e } = await pruefe({
      auditZeilen: [{
        id: 'a1', action: AKTION_EINGELOEST,
        new_state: { idempotency_key: 'alloc_andere_andere' },
        created_at: '2026-08-21T12:00:00Z',
      }],
    })
    expect(punkt(e, 9).stand).toBe('frei')
  })

  it('sperrt beide Punkte, wenn der Audit-Trail nicht lesbar ist', async () => {
    const { e } = await pruefe({ auditFehler: { message: 'permission denied' } })
    expect(punkt(e, 9).stand).toBe('gesperrt')
    expect(punkt(e, 10).stand).toBe('gesperrt')
  })

  it('liest den Audit-Trail mit Mandantenzaun', async () => {
    const { f } = await pruefe()
    const a = f.auf('billing_audit_trail').find(x => x.operation === 'select')
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'entity_type', 'payment_allocation')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3. Fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('Fail-closed', () => {
  it('kein Token, wenn irgendein Punkt sperrt', async () => {
    const f = fake({ rechnung: { ...STANDARD_RECHNUNG, status: 'bezahlt' } })
    const e = await oeffneAllocationGate(f.client as unknown as SupabaseClient, BASIS)
    expect(e.status).toBe('GESPERRT')
    expect(e.token).toBeNull()
  })

  it('kein Token, wenn es sich nicht ablegen lässt', async () => {
    const f = fake({ auditInsertFehler: { message: 'audit trail read only' } })
    const e = await oeffneAllocationGate(f.client as unknown as SupabaseClient, BASIS)
    expect(e.status).toBe('GESPERRT')
    expect(e.token).toBeNull()
    expect(e.sperren.join(' ')).toContain('nicht ablegbar')
  })

  it('ein nicht gesetzter Punkt gilt als gesperrt, nicht als frei', async () => {
    // Lesefehler auf der Rechnung: die Punkte 4–10 werden nie gesetzt.
    const { e } = await pruefe({ rechnungFehler: { message: 'timeout' } })
    for (const nr of [4, 5, 6, 7, 8, 9, 10]) {
      expect(punkt(e, nr).stand).toBe('gesperrt')
      expect(punkt(e, nr).befund).toContain('Nicht geprüft')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4. Es bucht nicht
// ═══════════════════════════════════════════════════════════════════════

describe('Keine Buchung', () => {
  it('pruefeZuordnung schreibt gar nichts', async () => {
    const { f } = await pruefe()
    expect(f.aufrufe.filter(a => a.operation !== 'select')).toEqual([])
  })

  it('oeffneAllocationGate schreibt AUSSCHLIESSLICH in billing_audit_trail', async () => {
    const f = fake()
    await oeffneAllocationGate(f.client as unknown as SupabaseClient, BASIS)
    const schreibend = f.aufrufe.filter(a => a.operation !== 'select')
    expect(schreibend.length).toBeGreaterThan(0)
    expect([...new Set(schreibend.map(a => a.tabelle))]).toEqual(['billing_audit_trail'])
  })

  it('rührt payments, invoices und payment_allocations nie schreibend an', async () => {
    const f = fake()
    await oeffneAllocationGate(f.client as unknown as SupabaseClient, BASIS)
    for (const tabelle of ['payments', 'invoices', 'payment_allocations']) {
      expect(f.auf(tabelle).every(a => a.operation === 'select')).toBe(true)
    }
  })

  it('das Modul exportiert keine Funktion, die zuordnet', async () => {
    const modul = await import('@/lib/pilot/allocation-gate')
    const verdaechtig = Object.keys(modul).filter(n =>
      /^(allocate|buche|ordneZu|schreibe)/i.test(n))
    expect(verdaechtig).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5. Der Token-Lebenszyklus
// ═══════════════════════════════════════════════════════════════════════

/** Baut die Audit-Zeile, die ein geöffnetes Gate hinterlassen hätte. */
function geoeffnet(token: string, zusatz: Record<string, unknown> = {}) {
  return {
    id: 'audit-open',
    action: AKTION_GEOEFFNET,
    created_at: '2026-08-21T12:00:00Z',
    new_state: {
      token,
      organization_id: ORG,
      payment_id: ZAHLUNG,
      invoice_id: RECHNUNG,
      betrag_cent: 15050,
      gueltig_bis: new Date(Date.now() + 10 * 60_000).toISOString(),
      idempotency_key: allocationIdempotencyKey(ZAHLUNG, RECHNUNG),
      ...zusatz,
    },
  }
}

const TOKEN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

async function einloesen(lage: Lage, zusatz: Partial<OeffneGateParams & { token: string }> = {}) {
  const f = fake(lage)
  const e = await loeseAllocationGateEin(f.client as unknown as SupabaseClient, {
    ...BASIS, token: TOKEN, ...zusatz,
  })
  return { e, f }
}

describe('Token-Lebenszyklus', () => {
  it('EINGELOEST bei gültigem Token und unveränderter Lage', async () => {
    const { e } = await einloesen({ auditZeilen: [geoeffnet(TOKEN)] })
    expect(e.befund).toBe('EINGELOEST')
    expect(e.darfBuchen).toBe(true)
    expect(e.erneutePruefung?.status).toBe('FREIGEGEBEN')
  })

  it('entwertet das Token mit einer eigenen Audit-Zeile', async () => {
    const { f } = await einloesen({ auditZeilen: [geoeffnet(TOKEN)] })
    const inserts = f.auf('billing_audit_trail').filter(a => a.operation === 'insert')
    expect(inserts.length).toBe(1)
    const payload = inserts[0].payload as { action: string; new_state: { token: string } }
    expect(payload.action).toBe(AKTION_EINGELOEST)
    expect(payload.new_state.token).toBe(TOKEN)
  })

  it('UNBEKANNT bei einem Token, das nie ausgestellt wurde', async () => {
    const { e } = await einloesen({ auditZeilen: [] })
    expect(e.befund).toBe('UNBEKANNT')
    expect(e.darfBuchen).toBe(false)
  })

  it('BEREITS_EINGELOEST beim zweiten Versuch', async () => {
    const { e } = await einloesen({
      auditZeilen: [
        geoeffnet(TOKEN),
        { id: 'audit-used', action: AKTION_EINGELOEST, created_at: '2026-08-21T12:05:00Z', new_state: { token: TOKEN } },
      ],
    })
    expect(e.befund).toBe('BEREITS_EINGELOEST')
    expect(e.darfBuchen).toBe(false)
  })

  it('ABGELAUFEN nach der Gültigkeitsfrist', async () => {
    const { e } = await einloesen({
      auditZeilen: [geoeffnet(TOKEN, { gueltig_bis: new Date(Date.now() - 60_000).toISOString() })],
    })
    expect(e.befund).toBe('ABGELAUFEN')
    expect(e.darfBuchen).toBe(false)
  })

  it('PASST_NICHT bei anderer Rechnung — ein Token deckt genau eine Kombination', async () => {
    const andereRechnung = '99999999-9999-4999-8999-999999999999'
    const { e } = await einloesen(
      { auditZeilen: [geoeffnet(TOKEN)] },
      { invoiceId: andereRechnung },
    )
    expect(e.befund).toBe('PASST_NICHT')
    expect(e.darfBuchen).toBe(false)
  })

  it('PASST_NICHT bei abweichendem Betrag', async () => {
    const { e } = await einloesen({ auditZeilen: [geoeffnet(TOKEN)] }, { betragCent: 10000 })
    expect(e.befund).toBe('PASST_NICHT')
    expect(e.darfBuchen).toBe(false)
  })

  it('ZUSTAND_GEAENDERT, wenn die Rechnung inzwischen bezahlt ist', async () => {
    const { e } = await einloesen({
      auditZeilen: [geoeffnet(TOKEN)],
      rechnung: { ...STANDARD_RECHNUNG, status: 'bezahlt' },
    })
    expect(e.befund).toBe('ZUSTAND_GEAENDERT')
    expect(e.darfBuchen).toBe(false)
    expect(e.begruendung).toContain('Endstatus')
  })

  it('ZUSTAND_GEAENDERT, wenn inzwischen eine Zuordnung existiert', async () => {
    const { e } = await einloesen({
      auditZeilen: [geoeffnet(TOKEN)],
      bestehendeZuordnungen: [
        { id: 'alloc-1', amount_cents: 15050, allocation_type: 'vollzahlung', allocated_at: '2026-08-21' },
      ],
    })
    expect(e.befund).toBe('ZUSTAND_GEAENDERT')
    expect(e.darfBuchen).toBe(false)
  })

  it('bucht NICHT, wenn die Entwertung scheitert', async () => {
    const { e } = await einloesen({
      auditZeilen: [geoeffnet(TOKEN)],
      auditInsertFehler: { message: 'audit trail read only' },
    })
    expect(e.darfBuchen).toBe(false)
    expect(e.begruendung).toContain('Ohne Entwertung wird nicht gebucht')
  })

  it('darfBuchen ist bei JEDEM Befund ausser EINGELOEST false', async () => {
    const faelle = [
      { auditZeilen: [] },
      { auditZeilen: [geoeffnet(TOKEN), { id: 'u', action: AKTION_EINGELOEST, created_at: 'x', new_state: { token: TOKEN } }] },
      { auditZeilen: [geoeffnet(TOKEN, { gueltig_bis: '2020-01-01T00:00:00Z' })] },
      { auditZeilen: [geoeffnet(TOKEN)], rechnung: { ...STANDARD_RECHNUNG, status: 'storniert' } },
      { auditFehler: { message: 'weg' } },
    ]
    for (const lage of faelle) {
      const { e } = await einloesen(lage as Lage)
      expect(e.darfBuchen).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6. Kein Batch
// ═══════════════════════════════════════════════════════════════════════

describe('Kein Batch', () => {
  it('die Parameter kennen genau EINE Rechnung — keine Liste', () => {
    // Strukturprüfung: gäbe es einen Listenparameter, hiesse er im Typ
    // anders. Der Test hält die Absicht fest, damit sie nicht später
    // „für den Sammelfall" aufgeweicht wird.
    const schluessel = Object.keys(BASIS)
    expect(schluessel).toContain('invoiceId')
    expect(schluessel.some(k => /allocations|invoiceIds|posten/i.test(k))).toBe(false)
  })

  it('ein zweites Gate auf dieselbe Kombination wird nach Einlösung gesperrt', async () => {
    const { e } = await pruefe({
      auditZeilen: [{
        id: 'a1', action: AKTION_EINGELOEST,
        new_state: { idempotency_key: allocationIdempotencyKey(ZAHLUNG, RECHNUNG) },
        created_at: '2026-08-21T12:00:00Z',
      }],
    })
    expect(e.status).toBe('GESPERRT')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7. Bericht
// ═══════════════════════════════════════════════════════════════════════

describe('Bericht', () => {
  it('sagt in den ersten Zeilen, dass nichts gebucht wurde', async () => {
    const { e } = await pruefe()
    const zeilen = gateBerichtText(e).split('\n')
    expect(zeilen.slice(0, 3).join(' ')).toContain('NICHTS gebucht')
  })

  it('führt alle zehn Punkte mit Zeichen und Befund auf', async () => {
    const { e } = await pruefe()
    const text = gateBerichtText(e)
    for (const p of e.punkte) {
      expect(text).toContain(p.titel)
      expect(text).toContain(p.befund)
    }
  })

  it('nennt bei Sperre kein Token', async () => {
    const { e } = await pruefe({ rechnung: { ...STANDARD_RECHNUNG, status: 'bezahlt' } })
    const text = gateBerichtText(e)
    expect(text).toContain('kein Token')
    expect(text).toContain('GESPERRT')
  })
})
