/**
 * § 302 SGB V — Rückläufer-Service
 *
 * Der Service ist ein Wrapper um die generische Rückläufer-Pipeline. Seine
 * ganze Daseinsberechtigung sind drei Festlegungen, und genau die werden
 * hier geprüft:
 *
 *   1. `verfahren: 'sgb_v_302'` ist FEST. § 105 und § 302 benutzen
 *      dieselben kurzen numerischen Fehlercodes mit ANDERER Bedeutung.
 *      Ohne die Festlegung klassifiziert die Pipeline einen § 302-
 *      Rückläufer nach dem § 105-Katalog — und die daraus erzeugte
 *      Aufgabe nennt den falschen Fehler.
 *   2. Die Brücke ist `sgb_v_lauf_id`, nicht `lauf_id`. Letzteres bleibt
 *      für § 105 reserviert; beide Verfahren teilen sich eine Tabelle.
 *   3. Der Mandant wird bei der Zuordnung ZWEIMAL geprüft — am Lauf und
 *      am Rückläufer. Eine Prüfung allein reichte nicht: man könnte einen
 *      fremden Rückläufer dem eigenen Lauf zuordnen oder umgekehrt.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const importiereRuecklaeufer = vi.fn(async () => ({ importiert: 1 } as never))
const markiereRuecklaeuferErledigt = vi.fn()
vi.mock('@/lib/abrechnung/ruecklaeufer', () => ({
  importiereRuecklaeufer: (c: unknown, p: unknown) => importiereRuecklaeufer(c as never, p as never),
  markiereRuecklaeuferErledigt: () => markiereRuecklaeuferErledigt(),
}))

const logBillingAction = vi.fn(async () => undefined)
vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: (...a: unknown[]) => logBillingAction(...(a as [])),
}))

const {
  importiereSgbVRuecklaeufer, ladeSgbVRuecklaeufer, ordneSgbVRuecklaeuferZu,
} = await import('@/lib/abrechnung/sgb-v/ruecklaufer-service')

type Client = Parameters<typeof ladeSgbVRuecklaeufer>[0]

const ORG = '00000000-0000-4000-8000-000460629986'
const LAUF = 'lauf-1'
const RUECK = 'rueck-1'

function fake(antworten: Record<string, { data?: unknown; error?: { message: string } }>) {
  const f = erstelleFakeSupabase((a: FakeAufruf) => antworten[a.tabelle] ?? { data: null })
  return { client: f.client as unknown as Client, aufrufe: f.aufrufe }
}

beforeEach(() => {
  importiereRuecklaeufer.mockClear()
  logBillingAction.mockClear()
})

describe('importiereSgbVRuecklaeufer', () => {
  it('setzt das Verfahren fest auf sgb_v_302', async () => {
    const { client } = fake({})
    await importiereSgbVRuecklaeufer(client, { sgbVLaufId: LAUF, organizationId: ORG } as never)
    expect(importiereRuecklaeufer.mock.calls[0][1]).toMatchObject({ verfahren: 'sgb_v_302' })
  })

  it('lässt das Verfahren NICHT vom Aufrufer überschreiben', async () => {
    // Ein durchgereichtes 'sgb_v_105' würde den falschen Fehlerkatalog
    // ziehen — dieselben Codes, andere Bedeutung.
    const { client } = fake({})
    await importiereSgbVRuecklaeufer(
      client,
      { sgbVLaufId: LAUF, organizationId: ORG, verfahren: 'sgb_v_105' } as never,
    )
    expect(importiereRuecklaeufer.mock.calls[0][1]).toMatchObject({ verfahren: 'sgb_v_302' })
  })

  it('bindet über sgb_v_lauf_id, nicht über lauf_id', async () => {
    // lauf_id bleibt für § 105 reserviert; beide teilen sich die Tabelle.
    const { client } = fake({})
    await importiereSgbVRuecklaeufer(client, { sgbVLaufId: LAUF, organizationId: ORG } as never)
    const uebergeben = importiereRuecklaeufer.mock.calls[0][1] as Record<string, unknown>
    expect(uebergeben.sgbVLaufId).toBe(LAUF)
    expect(uebergeben.laufId).toBeUndefined()
  })
})

describe('ladeSgbVRuecklaeufer', () => {
  it('grenzt auf den Mandanten ein', async () => {
    const { client, aufrufe } = fake({ dta_ruecklaeufer: { data: [] } })
    await ladeSgbVRuecklaeufer(client, ORG)
    expect(hatOrgFence(aufrufe[0], ORG)).toBe(true)
  })

  it('schließt § 105-Rückläufer aus', async () => {
    // Ohne diesen Filter kämen die Rückmeldungen des anderen Verfahrens
    // in die § 302-Liste — dieselbe Tabelle, andere Brücke.
    const { client, aufrufe } = fake({ dta_ruecklaeufer: { data: [] } })
    await ladeSgbVRuecklaeufer(client, ORG)
    expect(hatFilter(aufrufe[0], 'not', 'sgb_v_lauf_id')).toBe(true)
  })

  it('grenzt zusätzlich auf einen Lauf ein, wenn einer genannt ist', async () => {
    const { client, aufrufe } = fake({ dta_ruecklaeufer: { data: [] } })
    await ladeSgbVRuecklaeufer(client, ORG, LAUF)
    expect(hatFilter(aufrufe[0], 'eq', 'sgb_v_lauf_id', LAUF)).toBe(true)
  })

  it('filtert ohne Lauf-Angabe NICHT auf einen Lauf', async () => {
    const { client, aufrufe } = fake({ dta_ruecklaeufer: { data: [] } })
    await ladeSgbVRuecklaeufer(client, ORG)
    expect(hatFilter(aufrufe[0], 'eq', 'sgb_v_lauf_id')).toBe(false)
  })

  it('wirft bei einem Lesefehler', async () => {
    const { client } = fake({ dta_ruecklaeufer: { error: { message: 'weg' } } })
    await expect(ladeSgbVRuecklaeufer(client, ORG)).rejects.toThrow(/nicht geladen/)
  })
})

describe('ordneSgbVRuecklaeuferZu', () => {
  const erfolg = {
    sgb_v_laeufe: { data: { id: LAUF } },
    dta_ruecklaeufer: { data: { id: RUECK } },
  }

  it('prüft den Mandanten am Lauf UND am Rückläufer', async () => {
    const { client, aufrufe } = fake(erfolg)
    await ordneSgbVRuecklaeuferZu(client, ORG, RUECK, LAUF, 'actor')
    const lauf = aufrufe.find(a => a.tabelle === 'sgb_v_laeufe')
    const rueck = aufrufe.find(a => a.tabelle === 'dta_ruecklaeufer')
    expect(hatOrgFence(lauf, ORG)).toBe(true)
    expect(hatOrgFence(rueck, ORG)).toBe(true)
  })

  it('weist einen Lauf aus einer fremden Organisation ab', async () => {
    const { client } = fake({ sgb_v_laeufe: { data: null } })
    await expect(ordneSgbVRuecklaeuferZu(client, ORG, RUECK, LAUF, 'actor'))
      .rejects.toThrow(/Lauf nicht gefunden|andere/)
  })

  it('weist einen Rückläufer aus einer fremden Organisation ab', async () => {
    const { client } = fake({ ...erfolg, dta_ruecklaeufer: { data: null } })
    await expect(ordneSgbVRuecklaeuferZu(client, ORG, RUECK, LAUF, 'actor'))
      .rejects.toThrow(/Rückläufer nicht gefunden|andere/)
  })

  it('schreibt Zuordnung, Bearbeiter und Zeitpunkt', async () => {
    const { client, aufrufe } = fake(erfolg)
    await ordneSgbVRuecklaeuferZu(client, ORG, RUECK, LAUF, 'actor-7')
    const update = aufrufe.find(a => a.tabelle === 'dta_ruecklaeufer' && a.operation === 'update')
    expect(update?.payload).toMatchObject({
      sgb_v_lauf_id: LAUF, status: 'zugeordnet', bearbeitet_von: 'actor-7',
    })
    expect((update?.payload as Record<string, unknown>).bearbeitet_am).toBeTruthy()
  })

  it('protokolliert die Zuordnung', async () => {
    // Eine Zuordnung verschiebt Geld zwischen Abrechnungsläufen — ohne
    // Spur ist später nicht klärbar, wer sie gesetzt hat.
    const { client } = fake(erfolg)
    await ordneSgbVRuecklaeuferZu(client, ORG, RUECK, LAUF, 'actor-7')
    expect(logBillingAction).toHaveBeenCalledTimes(1)
    expect(logBillingAction.mock.calls[0][1]).toMatchObject({
      entityType: 'dta_ruecklaeufer', entityId: RUECK, organizationId: ORG, actorId: 'actor-7',
    })
  })

  it('protokolliert NICHT, wenn die Zuordnung scheitert', async () => {
    const { client } = fake({ sgb_v_laeufe: { data: null } })
    await expect(ordneSgbVRuecklaeuferZu(client, ORG, RUECK, LAUF, 'actor')).rejects.toThrow()
    expect(logBillingAction).not.toHaveBeenCalled()
  })
})
