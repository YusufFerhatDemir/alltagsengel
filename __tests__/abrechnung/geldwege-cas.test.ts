/**
 * Geldnahe Schreibwege: keine stille Zusage, kein verlorener Klick.
 *
 * @see app/admin/verordnungen/actions.ts
 * @see app/admin/zahlungskontrolle/actions.ts
 *
 * ── ZWEI VERSCHIEDENE FEHLER ──────────────────────────────────────────
 * 1. **Stille Zusage.** PostgREST meldet bei einem `update` ohne
 *    getroffene Zeile keinen Fehler. Der Lauf ging weiter und schrieb
 *    einen Audit-Eintrag über eine Betragsänderung oder eine Zahlung, die
 *    nicht stattgefunden hat. Bei Geld ist ein Protokoll, das die
 *    Unwahrheit sagt, schlimmer als gar keines.
 *
 * 2. **Verlorener Klick.** Die Umschalter schreiben `!currentValue` und der
 *    Mahnlauf `currentReminderCount + 1` — beides gerechnet auf dem Stand,
 *    den die Oberfläche GESEHEN hat. Ohne Bedingung auf denselben Wert
 *    kippt ein zweiter Klick aus einem zweiten Tab das Ergebnis zurück
 *    beziehungsweise verschluckt eine Mahnung, und beide Male meldet die
 *    Anwendung Erfolg.
 *
 * Geprüft wird, dass die Bedingungen an der Abfrage HÄNGEN. Ob die
 * Datenbank sie korrekt auswertet, ist ihre Sache, nicht die dieses Tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence,
  type FakeSupabase, type FakeAufruf,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const NUTZER = '22222222-2222-4222-8222-222222222222'
const ID = '33333333-3333-4333-8333-333333333333'

let fake: FakeSupabase

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/lib/organizations/server', () => ({
  getActiveOrgId: async () => ORG,
  getActiveOrgIdOrDefault: async () => ORG,
}))
vi.mock('@/lib/audit-log', () => ({ logAuditEventOrWarn: async () => {} }))

/** @param treffer Zeilen, die das Update zurückgibt — `[]` heisst „nichts getroffen". */
function baueFake(treffer: unknown[]) {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'profiles') {
      return { data: { role: 'admin', first_name: 'V', last_name: null }, error: null }
    }
    if (a.operation === 'update') return { data: treffer, error: null }
    return { data: null, error: null }
  })
  ;(f.client as any).auth = {
    getUser: async () => ({ data: { user: { id: NUTZER } }, error: null }),
  }
  return f
}

const update = (tabelle: string) =>
  fake.aufrufe.find(a => a.tabelle === tabelle && a.operation === 'update')

beforeEach(() => { fake = baueFake([{ id: ID }]) })

// ═══════════════════════════════════════════════════════════════════════
describe('saveVerordnungInvoiceEdit — Beträge', () => {
  const laden = async () =>
    (await import('@/app/admin/verordnungen/actions')).saveVerordnungInvoiceEdit

  it('schreibt mit Mandantenfilter und fragt nach der Wirkung', async () => {
    const r = await (await laden())(ID, '120', '100', '20', 'Kürzung laut Bescheid')
    expect(r).toEqual({ ok: true })
    const u = update('invoices')
    expect(u, 'kein Update abgesetzt').toBeDefined()
    expect(hatOrgFence(u!, ORG), 'Mandantenfilter fehlt').toBe(true)
    expect(u!.spalten, 'ohne select() bleibt die Wirkung unbekannt').toBeTruthy()
  })

  it('meldet einen Fehler, wenn keine Zeile getroffen wurde', async () => {
    // Fremde Organisation, geloescht, oder die ID stimmt nicht — in jedem
    // Fall hat sich nichts geaendert, und das muss ankommen.
    fake = baueFake([])
    const r = await (await laden())(ID, '120', '100', '20', '')
    expect(r.ok).toBe(false)
    expect((r as any).error).toMatch(/nicht gefunden|kein Zugriff/)
  })
})

describe('toggleInvoiceBezahlt', () => {
  const laden = async () =>
    (await import('@/app/admin/verordnungen/actions')).toggleInvoiceBezahlt

  it('setzt eine CAS-Bedingung auf `bezahlt`', async () => {
    await (await laden())(ID, false)
    const u = update('invoices')
    expect(u, 'kein Update abgesetzt').toBeDefined()
    // Der Kern: geschrieben wird `!false`, erlaubt nur, solange noch `false`
    // drinsteht. Ohne diese Bedingung kippt ein zweiter Tab den Wert zurueck.
    expect(hatFilter(u!, 'eq', 'bezahlt', false), 'CAS-Bedingung fehlt').toBe(true)
    expect(hatOrgFence(u!, ORG)).toBe(true)
  })

  it('schreibt beim Zurücksetzen das Zahldatum auf null', async () => {
    await (await laden())(ID, true)
    expect((update('invoices')!.payload as any).bezahlt_am).toBeNull()
  })

  it('meldet den Konflikt, statt still zurückzukippen', async () => {
    fake = baueFake([])
    const r = await (await laden())(ID, false)
    expect(r.ok).toBe(false)
    expect((r as any).error).toMatch(/geändert|neu laden/)
  })
})

describe('toggleInvoiceVersand', () => {
  const laden = async () =>
    (await import('@/app/admin/verordnungen/actions')).toggleInvoiceVersand

  it.each([['versand_post'], ['versand_elektronisch']] as const)(
    'setzt die CAS-Bedingung auf dasselbe Feld (%s)', async (feld) => {
      await (await laden())(ID, feld, true)
      const u = update('invoices')
      expect(hatFilter(u!, 'eq', feld, true), `CAS auf ${feld} fehlt`).toBe(true)
    })

  it('weist ein unbekanntes Feld ab, ohne zu schreiben', async () => {
    const r = await (await laden())(ID, 'rechnungsbetrag' as never, true)
    expect(r.ok).toBe(false)
    expect(update('invoices')).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
describe('sendPaymentReminder', () => {
  const laden = async () =>
    (await import('@/app/admin/zahlungskontrolle/actions')).sendPaymentReminder

  it('setzt eine CAS-Bedingung auf den Zähler', async () => {
    await (await laden())(ID, 2)
    const u = update('payment_status')
    expect(u, 'kein Update abgesetzt').toBeDefined()
    // Zwei gleichzeitige Klicks schrieben sonst beide `3` — eine Mahnung
    // verschwaende aus der Zaehlung, die Mahnstufe stimmte nicht mehr.
    expect(hatFilter(u!, 'eq', 'reminder_count', 2), 'CAS auf reminder_count fehlt').toBe(true)
    expect(hatOrgFence(u!, ORG)).toBe(true)
    expect((u!.payload as any).reminder_count).toBe(3)
  })

  it('wirft, wenn der Mahnstand sich geändert hat', async () => {
    fake = baueFake([])
    await expect((await laden())(ID, 2)).rejects.toThrow(/geändert|neu laden/)
  })

  it('weist einen ungültigen Zähler ab, ohne zu schreiben', async () => {
    await expect((await laden())(ID, -1)).rejects.toThrow()
    expect(update('payment_status')).toBeUndefined()
  })
})

describe('recordPayment', () => {
  const laden = async () =>
    (await import('@/app/admin/zahlungskontrolle/actions')).recordPayment

  it('bucht mit Mandantenfilter und prüft die Wirkung', async () => {
    await (await laden())(ID, 100, '2026-09-13', 'ueberweisung', 100)
    const u = update('payment_status')
    expect(hatOrgFence(u!, ORG)).toBe(true)
    expect((u!.payload as any).status).toBe('bezahlt')
  })

  it('bucht eine Teilzahlung als teilbezahlt', async () => {
    await (await laden())(ID, 40, '2026-09-13', 'ueberweisung', 100)
    expect((update('payment_status')!.payload as any).status).toBe('teilbezahlt')
  })

  it('wirft, wenn nichts gebucht wurde — NICHT stillschweigend ok', async () => {
    fake = baueFake([])
    await expect((await laden())(ID, 100, '2026-09-13', 'ueberweisung', 100))
      .rejects.toThrow(/nicht gefunden|kein Zugriff|NICHTS gebucht/)
  })
})
