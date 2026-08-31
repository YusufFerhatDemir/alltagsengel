/**
 * Tests fuer die Ladelage — die Trennung von „leer" und „fehlgeschlagen".
 * @see lib/ui/ladelage.ts
 *
 * Der Kern jeder Pruefung hier ist derselbe Satz: eine kaputte Abfrage darf
 * NIE als leere Liste enden. Genau dieser Durchrutscher liess Engel-Seiten
 * „Keine Einsaetze" anzeigen, obwohl die Abfrage gescheitert war.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ladeListe,
  ladeZeile,
  zeilenVon,
  zeileVon,
  laedt,
  istLeer,
  istFehler,
  zusammenfassen,
  LAEDT,
  LADEFEHLER_TEXT,
} from '@/lib/ui/ladelage'

/** Supabase-Query-Builder sind Thenables, keine Promises — genau so nachgebaut. */
function thenable<T>(ergebnis: T): PromiseLike<T> {
  return { then: (auf: (w: T) => unknown) => Promise.resolve(ergebnis).then(auf) } as PromiseLike<T>
}

describe('ladeListe', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('liefert die Zeilen bei Erfolg', async () => {
    const lage = await ladeListe(thenable({ data: [{ id: 'a' }, { id: 'b' }], error: null }))
    expect(lage.status).toBe('fertig')
    expect(zeilenVon(lage)).toHaveLength(2)
    expect(istLeer(lage)).toBe(false)
    expect(istFehler(lage)).toBe(false)
  })

  it('ist leer, wenn die Abfrage erfolgreich keine Zeilen liefert', async () => {
    const lage = await ladeListe(thenable({ data: [], error: null }))
    expect(istLeer(lage)).toBe(true)
    expect(istFehler(lage)).toBe(false)
  })

  it('wertet data=null OHNE Fehler als leeres Ergebnis, nicht als Stoerung', async () => {
    const lage = await ladeListe(thenable({ data: null, error: null }))
    expect(istLeer(lage)).toBe(true)
    expect(istFehler(lage)).toBe(false)
  })

  it('macht aus einem Abfragefehler NIE eine leere Liste', async () => {
    const lage = await ladeListe(
      thenable({ data: null, error: { message: 'permission denied for table assignments', code: '42501' } }),
    )
    expect(istFehler(lage)).toBe(true)
    // Das ist der Kern: der Leerzustand darf hier nicht greifen.
    expect(istLeer(lage)).toBe(false)
    expect(zeilenVon(lage)).toEqual([])
  })

  it('zeigt Nutzern nie den Datenbanktext', async () => {
    const lage = await ladeListe(
      thenable({ data: null, error: { message: 'relation "public.geheim" does not exist', code: '42P01' } }),
    )
    expect(lage.status).toBe('fehler')
    if (lage.status !== 'fehler') return
    expect(lage.meldung).toBe(LADEFEHLER_TEXT)
    expect(lage.meldung).not.toContain('relation')
    expect(lage.meldung).not.toContain('42P01')
  })

  it('faengt eine geworfene Abfrage ab, statt die Seite abstuerzen zu lassen', async () => {
    const kaputt: PromiseLike<never> = {
      then: (_auf: unknown, ab?: (f: unknown) => unknown) =>
        Promise.reject(new Error('Network request failed')).then(undefined, ab) as PromiseLike<never>,
    }
    const lage = await ladeListe(kaputt as PromiseLike<{ data: never[] | null; error: null }>)
    expect(istFehler(lage)).toBe(true)
    expect(istLeer(lage)).toBe(false)
  })

  it('protokolliert den technischen Grund, damit er nicht verloren geht', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await ladeListe(
      thenable({ data: null, error: { message: 'permission denied', code: '42501' } }),
      'engel:einsaetze',
    )
    const ausgabe = spy.mock.calls.flat().map(String).join(' ')
    expect(ausgabe).toContain('engel:einsaetze')
  })
})

describe('ladeZeile', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('liefert die Zeile bei Erfolg', async () => {
    const lage = await ladeZeile(thenable({ data: { id: 'cg-1' }, error: null }))
    expect(zeileVon(lage)).toEqual({ id: 'cg-1' })
  })

  it('behandelt PGRST116 als „keine Zeile", nicht als Ladefehler', async () => {
    // Sonst zeigt jedes legitime „noch kein Datensatz" eine Stoerung an.
    const lage = await ladeZeile(thenable({ data: null, error: { code: 'PGRST116', message: 'no rows' } }))
    expect(istFehler(lage)).toBe(false)
    expect(istLeer(lage)).toBe(true)
    expect(zeileVon(lage)).toBeNull()
  })

  it('meldet einen echten Fehler als Fehler, nicht als fehlende Zeile', async () => {
    const lage = await ladeZeile(thenable({ data: null, error: { code: '42501', message: 'permission denied' } }))
    expect(istFehler(lage)).toBe(true)
    expect(istLeer(lage)).toBe(false)
    expect(zeileVon(lage)).toBeNull()
  })
})

describe('Hilfsfunktionen', () => {
  it('LAEDT ist der Startwert und meldet sich als ladend', () => {
    expect(laedt(LAEDT)).toBe(true)
    expect(istLeer(LAEDT)).toBe(false)
    expect(istFehler(LAEDT)).toBe(false)
    // Ladend ist nicht leer — sonst blitzt der Leerzustand vor den Daten auf.
    expect(zeilenVon(LAEDT)).toEqual([])
  })

  it('zusammenfassen laesst den Fehler gewinnen', () => {
    expect(
      zusammenfassen([{ status: 'fertig', zeilen: [1] }, { status: 'fehler', meldung: 'x' }]),
    ).toBe('fehler')
  })

  it('zusammenfassen meldet ladend, solange eine Teilabfrage laeuft', () => {
    expect(zusammenfassen([{ status: 'fertig', zeilen: [] }, LAEDT])).toBe('laedt')
  })

  it('zusammenfassen ist nur fertig, wenn alle fertig sind', () => {
    expect(zusammenfassen([{ status: 'fertig', zeilen: [] }, { status: 'fertig', zeilen: [1] }])).toBe('fertig')
  })

  it('zusammenfassen einer leeren Menge ist fertig', () => {
    expect(zusammenfassen([])).toBe('fertig')
  })
})
