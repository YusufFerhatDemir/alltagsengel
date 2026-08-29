/**
 * Das Arbeitsblatt des Folgedienstes — die Abfrage dahinter und das
 * Abhaken.
 *
 * HINTERGRUND: `/api/uebergaben/handlungsbedarfe` beschreibt sich im
 * Quelltext selbst als „das Arbeitsblatt des Folgedienstes" und wurde von
 * keiner Stelle der Oberfläche aufgerufen. Offene Handlungsbedarfe waren nur
 * zu sehen, indem man jedes Protokoll einzeln öffnete — und je älter ein
 * offener Punkt ist, desto unwahrscheinlicher wird, dass ihn noch jemand in
 * dem Protokoll sucht, in dem er entstanden ist.
 *
 * Das Modul `lib/uebergabe/punkte.ts` hatte bis dahin keine Abdeckung
 * (einzig `kenntnisnahmen.test.ts` prüfte einen Nachbarn). Geprüft werden
 * hier die beiden Funktionen, auf denen das neue Arbeitsblatt aufsetzt.
 */
import { describe, it, expect } from 'vitest'
import { listOffeneHandlungsbedarfe, setErledigt } from '@/lib/uebergabe/punkte'
import {
  erstelleFakeSupabase, hatFilter, hatOrgFence,
  type FakeAufruf,
} from '../helpers/supabase-fake'

const ORG = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function fake(antwort: { data?: unknown; error?: unknown } = { data: [] }) {
  return erstelleFakeSupabase((_a: FakeAufruf) => antwort)
}

/**
 * Die gesetzte Zeilengrenze als Zahl, oder `null` wenn keine gesetzt wurde.
 *
 * `hatFilter` taugt hier nicht: der Doppelgänger legt das ERSTE Argument
 * jedes Kettenaufrufs als `spalte` ab, und `.limit(50)` hat gar keine
 * Spalte — die Zahl landet dort als Zeichenkette. Ein `hatFilter(a,
 * 'limit')` wäre deshalb immer falsch gewesen und hätte „keine Grenze"
 * gemeldet, auch wenn eine gesetzt war.
 */
function grenzeVon(aufruf: FakeAufruf | undefined): number | null {
  const treffer = aufruf?.filter.find(f => f.methode === 'limit')
  return treffer ? Number(treffer.spalte) : null
}

describe('listOffeneHandlungsbedarfe', () => {
  it('setzt den Mandanten-Fence', async () => {
    const f = fake()
    await listOffeneHandlungsbedarfe(f.client, ORG)
    expect(hatOrgFence(f.ersterAuf('uebergabe_punkte'), ORG)).toBe(true)
  })

  it('holt nur Punkte MIT Handlungsbedarf und NICHT erledigte', async () => {
    // Beide Filter zusammen sind der Gegenstand. Fehlte der erste, stünden
    // reine Informationspunkte im Arbeitsblatt und ersäuften die Aufgaben.
    // Fehlte der zweite, bliebe jeder abgehakte Punkt für immer stehen —
    // die Liste würde nie kürzer und niemand könnte sie abarbeiten.
    const f = fake()
    await listOffeneHandlungsbedarfe(f.client, ORG)
    const a = f.ersterAuf('uebergabe_punkte')
    expect(hatFilter(a, 'eq', 'handlungsbedarf', true)).toBe(true)
    expect(hatFilter(a, 'eq', 'erledigt', false)).toBe(true)
  })

  it('begrenzt auch ohne ausdrückliche Angabe', async () => {
    // Ein Arbeitsblatt ohne Deckel wächst mit jedem nicht abgehakten Punkt.
    const f = fake()
    await listOffeneHandlungsbedarfe(f.client, ORG)
    expect(grenzeVon(f.ersterAuf('uebergabe_punkte'))).toBeGreaterThan(0)
  })

  it('übernimmt eine ausdrückliche Grenze', async () => {
    const f = fake()
    await listOffeneHandlungsbedarfe(f.client, ORG, 5)
    expect(grenzeVon(f.ersterAuf('uebergabe_punkte'))).toBe(5)
  })

  it('meldet einen Datenbankfehler, statt eine leere Liste zurückzugeben', async () => {
    // Eine leere Liste hieße „nichts offen" — die beruhigendste aller
    // falschen Antworten.
    const f = fake({ data: null, error: { message: 'Verbindung weg' } })
    await expect(listOffeneHandlungsbedarfe(f.client, ORG)).rejects.toThrow(/Verbindung weg/)
  })

  it('gibt eine leere Liste zurück, wenn die Antwort null ist', async () => {
    const f = fake({ data: null, error: null })
    await expect(listOffeneHandlungsbedarfe(f.client, ORG)).resolves.toEqual([])
  })
})

describe('setErledigt', () => {
  const zeile = { id: 'p-1', erledigt: true }

  it('hält beim Abhaken fest, wann und von wem', async () => {
    const f = erstelleFakeSupabase(() => ({ data: zeile }))
    await setErledigt(f.client, 'p-1', ORG, true, USER)
    const nutzlast = f.ersterAuf('uebergabe_punkte', 'update')!.payload as Record<string, unknown>
    expect(nutzlast.erledigt).toBe(true)
    expect(nutzlast.erledigt_von).toBe(USER)
    expect(typeof nutzlast.erledigt_am).toBe('string')
  })

  it('räumt Zeitpunkt und Urheber wieder ab, wenn das Häkchen zurückgenommen wird', async () => {
    // Der Punkt: bliebe der Zeitstempel stehen, trüge ein offener Punkt
    // einen Erledigungsbeleg — ein Nachweis, der das Gegenteil dessen
    // behauptet, was der Zustand sagt.
    const f = erstelleFakeSupabase(() => ({ data: { id: 'p-1', erledigt: false } }))
    await setErledigt(f.client, 'p-1', ORG, false, USER)
    const nutzlast = f.ersterAuf('uebergabe_punkte', 'update')!.payload as Record<string, unknown>
    expect(nutzlast.erledigt).toBe(false)
    expect(nutzlast.erledigt_am).toBeNull()
    expect(nutzlast.erledigt_von).toBeNull()
  })

  it('schreibt nur innerhalb des eigenen Mandanten', async () => {
    // Die Route fährt mit dem Dienstschlüssel, RLS sieht diesen Schreibweg
    // also nie — der Fence im UPDATE ist die einzige Grenze.
    const f = erstelleFakeSupabase(() => ({ data: zeile }))
    await setErledigt(f.client, 'p-1', ORG, true, USER)
    const a = f.ersterAuf('uebergabe_punkte', 'update')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'id', 'p-1')).toBe(true)
  })

  it('meldet einen Fehlschlag, statt ihn zu verschlucken', async () => {
    const f = erstelleFakeSupabase(() => ({ data: null, error: { message: 'kein Treffer' } }))
    await expect(setErledigt(f.client, 'p-1', ORG, true, USER)).rejects.toThrow(/kein Treffer/)
  })
})
