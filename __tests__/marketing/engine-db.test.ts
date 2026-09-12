/**
 * Marketing-Engine an der Datenbank: Lesen, Vergleich-und-Setze, Anlegen.
 * @see lib/marketing/engine-db.ts
 */
import { describe, it, expect } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'
import {
  ladeStuecke, wechsleStufe, legeStueckAn, zaehleStufen, TABELLE,
  type GeladenesStueck,
} from '@/lib/marketing/engine-db'
import { nachNotiz, type MarketingStueck } from '@/lib/marketing/engine'

const ORG = '00000000-0000-4000-8000-000460629986'
const JETZT = new Date('2026-09-12T12:00:00Z')

function stueck(teil: Partial<MarketingStueck> = {}): MarketingStueck {
  return { stufe: 'review', projekt: 'Alltagsengel', plattform: 'Instagram', caption: 'Text', ...teil }
}

function geladen(teil: Partial<GeladenesStueck> = {}): GeladenesStueck {
  return {
    contentId: 'KW38_MO', stueck: stueck(), dbStatus: 'offen',
    kanal: 'instagram', veroeffentlichtAm: null, ...teil,
  }
}

describe('ladeStuecke', () => {
  it('liest Stufe und Felder aus der Notiz zurück', async () => {
    const s = stueck({ stufe: 'geplant', datum: '2026-09-14', hook: 'Aufhänger' })
    const mock = erstelleFakeSupabase(() => ({
      data: [{ content_id: 'KW38_MO', status: 'geplant', kanal: 'instagram',
               notiz: nachNotiz(s), veroeffentlicht_am: null }],
    }))
    const r = await ladeStuecke(mock.client as never, ORG)
    expect(r.fehler).toBeNull()
    expect(r.stuecke).toHaveLength(1)
    expect(r.stuecke[0].stueck.stufe).toBe('geplant')
    expect(r.stuecke[0].stueck.hook).toBe('Aufhänger')
    expect(r.stuecke[0].dbStatus).toBe('geplant')
  })

  it('filtert auf die Organisation — kein Mandantenleck', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    await ladeStuecke(mock.client as never, ORG)
    const a = mock.aufrufe.find((x: FakeAufruf) => x.tabelle === TABELLE)!
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('Lesefehler wird GEMELDET, nicht als „nichts geplant" verschluckt', async () => {
    const mock = erstelleFakeSupabase(() => ({ error: { message: 'kaputt' } }))
    const r = await ladeStuecke(mock.client as never, ORG)
    expect(r.stuecke).toEqual([])
    expect(r.fehler).toMatch(/kaputt/)
  })

  it('Altbestand ohne Nutzlast bekommt die Stufe aus dem Status', async () => {
    const mock = erstelleFakeSupabase(() => ({
      data: [{ content_id: 'ALT', status: 'geplant', kanal: null,
               notiz: 'Handnotiz', veroeffentlicht_am: null }],
    }))
    const r = await ladeStuecke(mock.client as never, ORG)
    expect(r.stuecke[0].stueck.stufe).toBe('freigegeben')
    expect(r.stuecke[0].stueck.ergebnis).toBe('Handnotiz')
  })

  it('Zeile mit unbekanntem Status wird ausgelassen, nicht erfunden', async () => {
    const mock = erstelleFakeSupabase(() => ({
      data: [{ content_id: 'X', status: 'irgendwas', kanal: null, notiz: null, veroeffentlicht_am: null }],
    }))
    const r = await ladeStuecke(mock.client as never, ORG)
    expect(r.stuecke).toEqual([])
    expect(r.fehler).toBeNull()
  })
})

describe('wechsleStufe', () => {
  it('weist einen regelwidrigen Übergang ab, ohne zu schreiben', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [{ content_id: 'KW38_MO' }] }))
    const r = await wechsleStufe(mock.client as never, ORG, geladen({ stueck: stueck({ stufe: 'entwurf' }) }), 'veroeffentlicht', JETZT)
    expect(r.ok).toBe(false)
    expect(r.fehler).toMatch(/nicht vorgesehen/)
    expect(mock.aufrufe.filter((a: FakeAufruf) => a.operation === 'update')).toHaveLength(0)
  })

  it('schreibt mit Vergleich-und-Setze auf den gelesenen Status', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [{ content_id: 'KW38_MO' }] }))
    const r = await wechsleStufe(mock.client as never, ORG, geladen({ dbStatus: 'offen' }), 'freigegeben', JETZT)
    expect(r.ok).toBe(true)
    expect(r.stufe).toBe('freigegeben')
    const u = mock.aufrufe.find((a: FakeAufruf) => a.operation === 'update')!
    expect(hatFilter(u, 'eq', 'status', 'offen')).toBe(true)
    expect(hatFilter(u, 'eq', 'content_id', 'KW38_MO')).toBe(true)
    expect(hatFilter(u, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('trifft der Vergleich keine Zeile, ist das ein Konflikt — kein stiller Erfolg', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    const r = await wechsleStufe(mock.client as never, ORG, geladen(), 'freigegeben', JETZT)
    expect(r.ok).toBe(false)
    expect(r.fehler).toMatch(/zwischenzeitlich geändert/)
  })

  it('Veröffentlichen setzt den Zeitstempel, den der DB-CHECK verlangt', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [{ content_id: 'KW38_MO' }] }))
    const g = geladen({ dbStatus: 'geplant', stueck: stueck({ stufe: 'geplant', datum: '2026-09-14' }) })
    const r = await wechsleStufe(mock.client as never, ORG, g, 'veroeffentlicht', JETZT)
    expect(r.ok).toBe(true)
    const u = mock.aufrufe.find((a: FakeAufruf) => a.operation === 'update')!
    const nutzlast = u.payload as Record<string, unknown>
    expect(nutzlast.status).toBe('veroeffentlicht')
    expect(nutzlast.veroeffentlicht_am).toBe(JETZT.toISOString())
  })

  it('jeder andere Zustand lässt den Zeitstempel leer', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [{ content_id: 'KW38_MO' }] }))
    await wechsleStufe(mock.client as never, ORG, geladen(), 'freigegeben', JETZT)
    const u = mock.aufrufe.find((a: FakeAufruf) => a.operation === 'update')!
    expect((u.payload as Record<string, unknown>).veroeffentlicht_am).toBeNull()
  })

  it('Schreibfehler wird gemeldet', async () => {
    const mock = erstelleFakeSupabase(() => ({ error: { message: 'constraint' } }))
    const r = await wechsleStufe(mock.client as never, ORG, geladen(), 'freigegeben', JETZT)
    expect(r.ok).toBe(false)
    expect(r.fehler).toMatch(/constraint/)
  })
})

describe('legeStueckAn', () => {
  it('stempelt einen bestehenden Stand NICHT zurück', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    const r = await legeStueckAn(mock.client as never, ORG, 'KW38_MO', stueck({ stufe: 'idee' }), 'instagram')
    expect(r.ok).toBe(true)
    const i = mock.aufrufe.find((a: FakeAufruf) => a.operation === 'insert')!
    // ignoreDuplicates ist der Riegel: ohne ihn würde ein „veröffentlicht"
    // beim erneuten Anlegen wieder zu „offen".
    expect(JSON.stringify(i.optionen ?? {})).toContain('ignoreDuplicates')
    expect(JSON.stringify(i.optionen ?? {})).toContain('organization_id,content_id')
  })

  it('trägt die Organisation mit — Dienstschlüssel hat kein auth.uid()', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    await legeStueckAn(mock.client as never, ORG, 'X', stueck())
    const i = mock.aufrufe.find((a: FakeAufruf) => a.operation === 'insert')!
    expect((i.payload as Record<string, unknown>).organization_id).toBe(ORG)
  })
})

describe('zaehleStufen', () => {
  it('zählt je Stufe, unbenutzte Stufen stehen auf 0', () => {
    const z = zaehleStufen([
      geladen({ stueck: stueck({ stufe: 'idee' }) }),
      geladen({ stueck: stueck({ stufe: 'idee' }) }),
      geladen({ stueck: stueck({ stufe: 'veroeffentlicht' }) }),
    ])
    expect(z.idee).toBe(2)
    expect(z.veroeffentlicht).toBe(1)
    expect(z.verworfen).toBe(0)
    expect(Object.keys(z)).toHaveLength(7)
  })
})
