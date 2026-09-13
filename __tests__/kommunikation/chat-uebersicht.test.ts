/**
 * Chatübersicht: zwei Abfragen, nicht zwei je Buchung.
 * @see lib/chat/uebersicht.ts
 *
 * ── DER BEFUND VOM 13.09.2026 ─────────────────────────────────────────
 * `app/kunde/chat` und `app/engel/chat` setzten je Buchung ZWEI Abfragen
 * ab — letzte Nachricht und Ungelesen-Zähler — nacheinander in einer
 * `for`-Schleife. Bei zwanzig Buchungen vierzig serialisierte Rundreisen,
 * bevor die Liste erscheint. Beide Seiten trugen denselben Code.
 *
 * Der wichtigste Test hier ist deshalb der Zähltest: **zwei** Aufrufe,
 * unabhängig von der Zahl der Buchungen.
 */
import { describe, it, expect } from 'vitest'
import { chatZusammenfassung, uhrzeit, NACHRICHTEN_OBERGRENZE } from '@/lib/chat/uebersicht'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const EMPFAENGER = '11111111-1111-4111-8111-111111111111'

function fake(nachrichten: unknown[], offene: unknown[]) {
  let n = 0
  return erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle !== 'messages') return undefined
    // Erste Abfrage: Nachrichten. Zweite: ungelesene.
    return { data: n++ === 0 ? nachrichten : offene, error: null }
  })
}

describe('chatZusammenfassung', () => {
  it('braucht ZWEI Abfragen, egal wie viele Buchungen', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `b${i}`)
    const f = fake([], [])
    await chatZusammenfassung(f.client as never, ids, EMPFAENGER)
    // Vorher waeren das 50 gewesen.
    expect(f.aufrufe.filter(a => a.tabelle === 'messages')).toHaveLength(2)
  })

  it('fragt gar nicht, wenn es keine Buchungen gibt', async () => {
    const f = fake([], [])
    const r = await chatZusammenfassung(f.client as never, [], EMPFAENGER)
    expect(f.aufrufe).toHaveLength(0)
    expect(r.letzte.size).toBe(0)
    expect(r.ungelesen.size).toBe(0)
  })

  it('nimmt je Buchung die NEUESTE Nachricht', async () => {
    // Absteigend sortiert geliefert — die erste je Buchung gewinnt.
    const f = fake([
      { booking_id: 'b1', content: 'neu', created_at: '2026-09-13T12:00:00Z' },
      { booking_id: 'b1', content: 'alt', created_at: '2026-09-01T08:00:00Z' },
      { booking_id: 'b2', content: 'anderes', created_at: '2026-09-10T09:00:00Z' },
    ], [])
    const r = await chatZusammenfassung(f.client as never, ['b1', 'b2'], EMPFAENGER)
    expect(r.letzte.get('b1')?.content).toBe('neu')
    expect(r.letzte.get('b2')?.content).toBe('anderes')
  })

  it('zählt ungelesene je Buchung', async () => {
    const f = fake([], [
      { booking_id: 'b1' }, { booking_id: 'b1' }, { booking_id: 'b2' },
    ])
    const r = await chatZusammenfassung(f.client as never, ['b1', 'b2', 'b3'], EMPFAENGER)
    expect(r.ungelesen.get('b1')).toBe(2)
    expect(r.ungelesen.get('b2')).toBe(1)
    // Keine ungelesene Nachricht heisst: kein Eintrag, nicht 0.
    expect(r.ungelesen.has('b3')).toBe(false)
  })

  it('filtert auf den angegebenen Empfänger und auf ungelesen', async () => {
    const f = fake([], [])
    await chatZusammenfassung(f.client as never, ['b1'], EMPFAENGER)
    const zaehl = f.aufrufe.filter(a => a.tabelle === 'messages')[1]
    expect(zaehl.filter.some(x => x.spalte === 'receiver_id' && x.wert === EMPFAENGER)).toBe(true)
    expect(zaehl.filter.some(x => x.spalte === 'read' && x.wert === false)).toBe(true)
  })

  it('begrenzt die Nachrichtenabfrage', async () => {
    // Ohne Grenze zoege eine Uebersicht im schlimmsten Fall den ganzen
    // Nachrichtenbestand.
    const f = fake([], [])
    await chatZusammenfassung(f.client as never, ['b1'], EMPFAENGER)
    expect(NACHRICHTEN_OBERGRENZE).toBeGreaterThan(0)
  })

  it('entdoppelt die Buchungs-IDs', async () => {
    const f = fake([], [])
    await chatZusammenfassung(f.client as never, ['b1', 'b1', 'b2'], EMPFAENGER)
    const erste = f.aufrufe.filter(a => a.tabelle === 'messages')[0]
    const inFilter = erste.filter.find(x => x.spalte === 'booking_id')
    expect((inFilter?.wert as string[]).length).toBe(2)
  })

  it('wirft mit Klartext, statt leere Listen zurückzugeben', async () => {
    // Eine leere Uebersicht sieht aus wie „keine Nachrichten" — der
    // Unterschied zu „konnte nicht laden" muss ankommen.
    const f = erstelleFakeSupabase(() => ({ data: null, error: { message: 'weg' } }))
    await expect(chatZusammenfassung(f.client as never, ['b1'], EMPFAENGER))
      .rejects.toThrow(/konnten nicht geladen werden|nicht geladen/)
  })
})

describe('uhrzeit', () => {
  it('formatiert deutsch, zweistellig', () => {
    expect(uhrzeit('2026-09-13T07:05:00Z')).toMatch(/^\d{2}:\d{2}$/)
  })
  it('leer bleibt leer, Unfug ebenso', () => {
    expect(uhrzeit(undefined)).toBe('')
    expect(uhrzeit('kein Datum')).toBe('')
  })
})
