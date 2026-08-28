/**
 * Track 12 / B6 — Mahnstufen-Eskalation ohne Compare-and-Swap
 *
 * `advanceDunning` liest den Mahneintrag, rechnet die naechste Stufe und die
 * zugehoerige Gebuehr aus und schreibt anschliessend
 *
 *     dunning_fee_cents = entry.dunning_fee_cents + feeCents
 *
 * — ein Lesen-Rechnen-Schreiben ohne Vergleich mit dem gelesenen Stand.
 * Die Stufe selbst ist dabei idempotent (zweimal derselbe Wert), die
 * Gebuehr ist es nicht: sie wird AUFADDIERT. Laufen zwei Eskalationen
 * desselben Eintrags nebeneinander — der taegliche Cron
 * (vercel.json: /api/cron/mahnlauf) und ein manueller Anstoss ueber
 * /api/billing/dunning/advance bzw. /lauf, oder schlicht ein
 * Wiederholungslauf desselben Crons —, dann lesen beide denselben Stand
 * und buchen die Mahngebuehr zweimal. Der Kunde bekommt eine Gebuehr in
 * Rechnung gestellt, die es nur einmal gibt.
 *
 * Geprueft wird deshalb nicht "kommt die richtige Stufe heraus", sondern:
 * steht der gelesene Stand als Bedingung IM Schreibvorgang, und was
 * passiert, wenn er dort nicht mehr steht.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from './helpers/supabase-fake'

// Das Safety-Gate wird in advanceDunning lazy importiert und haengt an
// weiteren Tabellen. Hier interessiert ausschliesslich der Schreibvorgang
// danach — das Gate wird deshalb auf "darf mahnen" gestellt.
vi.mock('@/lib/billing/dunning/mahn-safety-gate', () => ({
  pruefeMahnbarkeit: vi.fn(async () => ({ darfMahnen: true, gruende: [] })),
  MahnungGesperrtError: class MahnungGesperrtError extends Error {},
}))

vi.mock('@/lib/audit-log', () => ({
  logAuditEventOrWarn: vi.fn(async () => {}),
}))

const INVOICE = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const ACTOR = '33333333-3333-4333-8333-333333333333'

/** Mahneintrag auf 'erinnerung' mit bereits gebuchten 0 Cent Gebuehr. */
const EINTRAG = {
  id: 'de-1',
  invoice_id: INVOICE,
  organization_id: ORG,
  dunning_level: 'erinnerung',
  dunning_fee_cents: 0,
  due_date: '2026-06-01',
  block_dunning: false,
}

/**
 * @param eskalationTrifft  Zeilen, die der UPDATE zurueckgibt. Leer =
 *   der CAS hat nicht getroffen (ein paralleler Lauf war schneller).
 */
function baueFake(eskalationTrifft: boolean) {
  return erstelleFakeSupabase((aufruf: FakeAufruf) => {
    if (aufruf.tabelle === 'dunning_entries' && aufruf.operation === 'select') {
      return { data: EINTRAG }
    }
    if (aufruf.tabelle === 'dunning_entries' && aufruf.operation === 'update') {
      return { data: eskalationTrifft ? [{ id: 'de-1' }] : [] }
    }
    if (aufruf.tabelle === 'invoices') {
      return { data: { id: INVOICE, status: 'uebermittelt', total_amount: 500, paid_amount: 0 } }
    }
    return { data: null }
  })
}

describe('B6: Mahnstufen-Eskalation ist ein Compare-and-Swap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('schreibt den gelesenen Stand als Bedingung mit — sonst addiert ein Parallellauf die Gebuehr doppelt', async () => {
    const { advanceDunning } = await import('@/lib/billing/core/dunning')
    const fake = baueFake(true)

    await advanceDunning(fake.client as never, INVOICE, ACTOR, ORG)

    const update = fake.aufrufe.find(a => a.tabelle === 'dunning_entries' && a.operation === 'update')
    expect(update).toBeDefined()

    // Der Kern des Fixes: der gelesene Stand steht im WHERE.
    expect(hatFilter(update, 'eq', 'dunning_level', 'erinnerung')).toBe(true)

    // Mandanten- und Rechnungsbindung bleiben unveraendert bestehen —
    // ohne sie koennte ein Aufruf mit fremder invoiceId eine fremde
    // Mahngebuehr buchen.
    expect(hatFilter(update, 'eq', 'invoice_id', INVOICE)).toBe(true)
    expect(hatFilter(update, 'eq', 'organization_id', ORG)).toBe(true)

    // Und das Ergebnis muss ueberhaupt auswertbar sein: ohne .select()
    // meldet PostgREST keinen Fehler, wenn null Zeilen getroffen wurden.
    expect(update!.spalten).toBeTruthy()
  })

  it('GEGENPROBE: der ungestoerte Lauf eskaliert wie bisher und bucht die Gebuehr genau einmal', async () => {
    // Ohne diese Probe waere "wirft immer" ebenfalls gruen.
    const { advanceDunning, DUNNING_FEES_CENTS } = await import('@/lib/billing/core/dunning')
    const fake = baueFake(true)

    const ergebnis = await advanceDunning(fake.client as never, INVOICE, ACTOR, ORG)

    expect(ergebnis.newLevel).toBe('mahnung_1')
    expect(ergebnis.feeCents).toBe(DUNNING_FEES_CENTS.mahnung_1)

    const update = fake.aufrufe.find(a => a.tabelle === 'dunning_entries' && a.operation === 'update')
    const payload = update!.payload as Record<string, unknown>
    expect(payload.dunning_level).toBe('mahnung_1')
    // 0 vorhandene + 250 neue Cent — einmal, nicht zweimal.
    expect(payload.dunning_fee_cents).toBe(250)
  })

  it('GEGENPROBE: trifft der CAS nicht, wird weder Gebuehr gebucht noch die Rechnung nachgezogen', async () => {
    const { advanceDunning, MahnstufeBereitsEskaliertError } = await import('@/lib/billing/core/dunning')
    const fake = baueFake(false)

    await expect(advanceDunning(fake.client as never, INVOICE, ACTOR, ORG))
      .rejects.toBeInstanceOf(MahnstufeBereitsEskaliertError)

    // Das eigentlich Wichtige ist, was NICHT passiert ist: kein
    // Folgeschreibvorgang auf invoices, kein Audit-Eintrag ueber eine
    // Eskalation, die es nicht gab.
    const invoiceUpdates = fake.aufrufe.filter(a => a.tabelle === 'invoices' && a.operation === 'update')
    expect(invoiceUpdates).toHaveLength(0)
  })

  it('nennt im Fehler den gelesenen Stand und die Zielstufe', async () => {
    const { advanceDunning, MahnstufeBereitsEskaliertError } = await import('@/lib/billing/core/dunning')
    const fake = baueFake(false)

    try {
      await advanceDunning(fake.client as never, INVOICE, ACTOR, ORG)
      throw new Error('haette werfen muessen')
    } catch (err) {
      expect(err).toBeInstanceOf(MahnstufeBereitsEskaliertError)
      const e = err as InstanceType<typeof MahnstufeBereitsEskaliertError>
      expect(e.gelesenerStand).toBe('erinnerung')
      expect(e.zielStufe).toBe('mahnung_1')
      expect(e.message).toMatch(/keine zweite Mahngebuehr/)
    }
  })
})
