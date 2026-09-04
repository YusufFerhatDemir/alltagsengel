/**
 * § 302 SGB V — Abrechnungslauf (Lese-Endpunkte)
 *
 * Die Datei ist eine dünne Fassade — geprüft wird deshalb genau das, was
 * eine Fassade falsch machen kann, und das ist nicht wenig:
 *
 *   • Der Mandantenfilter. Ohne ihn liest eine Organisation die
 *     Abrechnungsläufe einer anderen — mit Kostenträger-IK, Fallzahlen
 *     und Gesamtbeträgen. Der org_fence in der Datenbank fängt das ab,
 *     aber ein leeres Ergebnis ist bei PostgREST mehrdeutig; der Filter
 *     ist die AUSSAGE, die Policy die Sperre.
 *   • Der deleted_at-Filter. Ohne ihn tauchen gelöschte Läufe wieder auf.
 *   • Fail-closed. Ein Lesefehler, der als leere Liste durchgeht, sieht
 *     aus wie „es gibt keine Abrechnungsläufe" — und darauf wird dann
 *     ein neuer Lauf gestartet.
 */

import { describe, it, expect, vi } from 'vitest'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'

const erzeugeUndVersendeSgbV = vi.fn(async () => ({ ok: true } as never))
vi.mock('@/lib/abrechnung/sgb-v/versand', () => ({
  erzeugeUndVersendeSgbV: (...a: unknown[]) => erzeugeUndVersendeSgbV(...(a as [])),
}))

const {
  listeAbrechnungslaeufe, ladeAbrechnungslauf, starteAbrechnungslauf,
} = await import('@/lib/abrechnung/sgb-v/abrechnungslauf')

type Client = Parameters<typeof listeAbrechnungslaeufe>[0]

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMD = '00000000-0000-4000-8000-000000000fff'

function fake(antwort: { data?: unknown; error?: { message: string } }) {
  const f = erstelleFakeSupabase((a: FakeAufruf) =>
    a.tabelle === 'sgb_v_laeufe' ? antwort : { data: null })
  return { client: f.client as unknown as Client, aufrufe: f.aufrufe }
}

describe('listeAbrechnungslaeufe', () => {
  it('grenzt auf den Mandanten ein', async () => {
    const { client, aufrufe } = fake({ data: [] })
    await listeAbrechnungslaeufe(client, ORG)
    expect(hatOrgFence(aufrufe[0], ORG)).toBe(true)
    expect(hatOrgFence(aufrufe[0], FREMD)).toBe(false)
  })

  it('blendet gelöschte Läufe aus', async () => {
    const { client, aufrufe } = fake({ data: [] })
    await listeAbrechnungslaeufe(client, ORG)
    expect(hatFilter(aufrufe[0], 'is', 'deleted_at', null)).toBe(true)
  })

  it('sortiert die neuesten nach vorn', async () => {
    const { client, aufrufe } = fake({ data: [] })
    await listeAbrechnungslaeufe(client, ORG)
    expect(hatFilter(aufrufe[0], 'order', 'erstellt_am')).toBe(true)
  })

  it('liest die Felder, die die Übersicht braucht', async () => {
    // Fehlt eine Spalte im select, ist sie in der Oberfläche `undefined` —
    // ein Gesamtbetrag, der als leer erscheint, ist schlimmer als keiner.
    const { client, aufrufe } = fake({ data: [] })
    await listeAbrechnungslaeufe(client, ORG)
    for (const spalte of ['status', 'sperr_grund', 'gesamtbetrag_cent', 'anzahl_faelle', 'korrektur_von']) {
      expect(aufrufe[0].spalten, spalte).toContain(spalte)
    }
  })

  it('wirft bei einem Lesefehler, statt eine leere Liste zu liefern', async () => {
    // Sonst sieht ein Ausfall aus wie „es gibt keine Läufe".
    const { client } = fake({ error: { message: 'Verbindung weg' } })
    await expect(listeAbrechnungslaeufe(client, ORG)).rejects.toThrow(/nicht geladen/)
  })

  it('liefert bei null-Daten eine leere Liste', async () => {
    const { client } = fake({ data: null })
    expect(await listeAbrechnungslaeufe(client, ORG)).toEqual([])
  })
})

describe('ladeAbrechnungslauf', () => {
  it('prüft Lauf UND Mandant', async () => {
    // Nur über die ID zu gehen, gäbe eine fremde Abrechnung heraus, wenn
    // die ID bekannt ist.
    const { client, aufrufe } = fake({ data: { id: 'l1' } })
    await ladeAbrechnungslauf(client, ORG, 'l1')
    expect(hatFilter(aufrufe[0], 'eq', 'id', 'l1')).toBe(true)
    expect(hatOrgFence(aufrufe[0], ORG)).toBe(true)
  })

  it('wirft bei einem Lesefehler', async () => {
    const { client } = fake({ error: { message: 'kaputt' } })
    await expect(ladeAbrechnungslauf(client, ORG, 'l1')).rejects.toThrow(/nicht geladen/)
  })

  it('liefert null, wenn es den Lauf nicht gibt', async () => {
    const { client } = fake({ data: null })
    expect(await ladeAbrechnungslauf(client, ORG, 'gibt-es-nicht')).toBeNull()
  })
})

describe('starteAbrechnungslauf', () => {
  it('reicht unverändert an die Versandkette durch', async () => {
    // Die Fassade darf die Orchestrierung NICHT nachbauen — sonst gibt es
    // zwei Wege zum Versand, und nur einer ist abgesichert.
    const { client } = fake({ data: null })
    const params = { organizationId: ORG, abrechnungsmonat: '2026-08' } as never
    await starteAbrechnungslauf(client, params)
    expect(erzeugeUndVersendeSgbV).toHaveBeenCalledWith(client, params)
  })
})
