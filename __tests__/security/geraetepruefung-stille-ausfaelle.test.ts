/**
 * „Unbekanntes Gerät" — die Meldung, die sich für immer wiederholt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 67)
 *
 * `geraetPruefen()` entscheidet mit ihrem Rückgabewert `neu`, ob eine
 * Sicherheitsmeldung „unbekanntes Gerät" an den Kontoinhaber hinausgeht
 * (lib/security/index.ts). Alle drei Datenbankzugriffe der Funktion
 * verwarfen ihr Ergebnis.
 *
 * Der try/catch darum sieht aus wie eine Absicherung, ist aber keine:
 * PostgREST WIRFT nicht. Ein abgelehnter Schreibvorgang kommt als `error`
 * im Rückgabewert zurück und erreicht den catch nie — abgefangen wurde
 * nur, was gar nicht passierte.
 *
 * Zwei Folgen, beide gegen den ausdrücklichen Zweck der Funktion:
 *
 *   1. Scheiterte das Anlegen, wurde das Gerät nie gemerkt — und die
 *      Meldung ging bei JEDER weiteren Anmeldung von diesem Gerät erneut
 *      hinaus. Der Kopf der Funktion begründet ausführlich, warum eine
 *      überflüssige Meldung schädlich ist: sie „erzieht nur dazu, solche
 *      Mails zu ignorieren".
 *   2. Scheiterte das Lesen, sah ein bekanntes Gerät unbekannt aus. Das
 *      anschließende Anlegen lief gegen UNIQUE(user_id, device_hash) —
 *      auch dieser Fehler wurde verworfen — und die Funktion meldete ein
 *      neues Gerät, obwohl die Datenbank soeben bewiesen hatte, dass es
 *      bekannt ist.
 *
 * Live gemessen: 11 Zeilen, 11 Konten, höchster Zähler 16. Der eindeutige
 * Index über (user_id, device_hash) steht.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

type Fehler = { message: string; code?: string } | null

const { fehlerLog } = vi.hoisted(() => ({ fehlerLog: vi.fn() }))
vi.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({
      error: fehlerLog, warn: vi.fn(), info: vi.fn(), debug: vi.fn(),
      errorWithException: fehlerLog,
    }),
  },
}))

import { geraetPruefen } from '@/lib/security/audit'

const NUTZER = '11111111-0000-4000-8000-000000000001'

interface Lage {
  /** Der vorhandene Eintrag — null heißt „Gerät unbekannt". */
  bestand: { id: string; seen_count: number } | null
  leseFehler: Fehler
  updateFehler: Fehler
  /** Getroffene Zeilen des UPDATE. */
  updateZeilen: number
  anzahl: number | null
  zaehlFehler: Fehler
  anlageFehler: Fehler
}

function lage(over: Partial<Lage> = {}): Lage {
  return {
    bestand: null, leseFehler: null, updateFehler: null, updateZeilen: 1,
    anzahl: 0, zaehlFehler: null, anlageFehler: null, ...over,
  }
}

/** Genau die vier Ketten, die `geraetPruefen` baut — nicht mehr. */
function fakeAdmin(l: Lage) {
  const protokoll: string[] = []
  const client = {
    from() {
      const kette: Record<string, unknown> = {}
      let istZaehlung = false
      let istUpdate = false
      kette.select = (_s: string, opt?: { head?: boolean }) => {
        if (opt?.head) istZaehlung = true
        return kette
      }
      kette.update = () => { istUpdate = true; return kette }
      kette.insert = async () => {
        protokoll.push('insert')
        return { data: null, error: l.anlageFehler }
      }
      kette.eq = () => kette
      kette.maybeSingle = async () => {
        protokoll.push('lesen')
        return { data: l.leseFehler ? null : l.bestand, error: l.leseFehler }
      }
      kette.then = (auf: (v: unknown) => unknown) => {
        if (istZaehlung) {
          protokoll.push('zaehlen')
          return Promise.resolve(auf({ data: null, count: l.anzahl, error: l.zaehlFehler }))
        }
        if (istUpdate) {
          protokoll.push('update')
          return Promise.resolve(auf({
            data: l.updateFehler ? null : Array.from({ length: l.updateZeilen }, () => ({ id: 'd1' })),
            error: l.updateFehler,
          }))
        }
        return Promise.resolve(auf({ data: null, error: null }))
      }
      return kette
    },
  }
  return { client: client as never, protokoll }
}

async function pruefe(l: Lage) {
  const { client, protokoll } = fakeAdmin(l)
  const ergebnis = await geraetPruefen(client, NUTZER, 'web', 'Mozilla/5.0', 'Chrome auf macOS')
  return { ...ergebnis, protokoll }
}

function protokollText(): string {
  return fehlerLog.mock.calls.map(c => JSON.stringify(c)).join('\n')
}

beforeEach(() => vi.clearAllMocks())

describe('Bekanntes Gerät', () => {
  it('meldet nichts und schreibt fort', async () => {
    const res = await pruefe(lage({ bestand: { id: 'd1', seen_count: 3 } }))
    expect(res.neu).toBe(false)
    expect(res.protokoll).toContain('update')
    expect(fehlerLog).not.toHaveBeenCalled()
  })

  it('benennt ein fehlgeschlagenes Fortschreiben', async () => {
    const res = await pruefe(lage({
      bestand: { id: 'd1', seen_count: 3 },
      updateFehler: { message: 'connection reset', code: '08006' },
    }))
    expect(res.neu).toBe(false)
    expect(protokollText()).toMatch(/nicht fortgeschrieben/)
  })

  it('auch dann, wenn es null Zeilen traf', async () => {
    // PostgREST meldet null getroffene Zeilen nicht als Fehler.
    await pruefe(lage({ bestand: { id: 'd1', seen_count: 3 }, updateZeilen: 0 }))
    expect(protokollText()).toMatch(/nicht fortgeschrieben/)
  })
})

describe('Neues Gerät', () => {
  it('meldet es, wenn schon ein anderes bekannt ist', async () => {
    const res = await pruefe(lage({ anzahl: 2 }))
    expect(res.neu).toBe(true)
    expect(res.protokoll).toContain('insert')
  })

  it('schweigt beim allerersten Gerät eines Kontos', async () => {
    const res = await pruefe(lage({ anzahl: 0 }))
    expect(res.neu).toBe(false)
  })
})

describe('Das Gerät konnte nicht gemerkt werden', () => {
  it('wird benannt — sonst wiederholt sich die Meldung stumm für immer', async () => {
    const res = await pruefe(lage({
      anzahl: 2, anlageFehler: { message: 'permission denied', code: '42501' },
    }))
    expect(protokollText()).toMatch(/NICHT gemerkt/)
    // Die Meldung bleibt bewusst stehen: sie kann echt sein.
    expect(res.neu).toBe(true)
  })
})

describe('Der eindeutige Index beweist: bekannt', () => {
  it('macht aus 23505 keine Falschmeldung', async () => {
    // Zwei parallele Anmeldungen, oder die Lesung oben ist gescheitert.
    const res = await pruefe(lage({
      anzahl: 2, anlageFehler: { message: 'duplicate key', code: '23505' },
    }))
    expect(res.neu).toBe(false)
  })

  it('auch dann nicht, wenn die Lesung gescheitert war', async () => {
    const res = await pruefe(lage({
      leseFehler: { message: 'connection reset', code: '08006' },
      anzahl: 2,
      anlageFehler: { message: 'duplicate key', code: '23505' },
    }))
    expect(res.neu).toBe(false)
    expect(protokollText()).toMatch(/nicht lesbar/)
  })

  it('23505 allein ist kein Grund für einen Fehlereintrag', async () => {
    await pruefe(lage({ anzahl: 2, anlageFehler: { message: 'duplicate key', code: '23505' } }))
    expect(protokollText()).not.toMatch(/NICHT gemerkt/)
  })
})

describe('Die Gerätezahl', () => {
  it('ist unbestimmt, wenn sie nicht gelesen werden kann — und das steht im Protokoll', async () => {
    const res = await pruefe(lage({ anzahl: null, zaehlFehler: { message: 'x', code: '08006' } }))
    expect(protokollText()).toMatch(/nicht ermittelbar/)
    // `null` heißt „keine Auskunft" — und damit der stillere Irrtum.
    expect(res.neu).toBe(false)
  })
})

describe('Der Hash bleibt in jedem Fall stabil', () => {
  it('auch wenn jeder einzelne Zugriff scheitert', async () => {
    const a = await pruefe(lage({ anzahl: 2 }))
    const b = await pruefe(lage({
      leseFehler: { message: 'x' }, zaehlFehler: { message: 'x' }, anlageFehler: { message: 'x' },
    }))
    expect(b.hash).toBe(a.hash)
    expect(b.hash).toMatch(/^[0-9a-f]{16,}$/)
  })
})
