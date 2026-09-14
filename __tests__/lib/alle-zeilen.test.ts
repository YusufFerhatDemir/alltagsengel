/**
 * Alle Zeilen — nicht die ersten tausend
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 101/102)
 *
 * PostgREST deckelt die zurueckgegebene Darstellung. LIVE GEMESSEN am
 * 14.09.2026: ein `select` auf page_views (10 359 Zeilen) liefert ohne
 * `limit` genau 1000 — HTTP 200, kein Fehler, keine Warnung. Die Wahrheit
 * steht allein im Header `Content-Range: 0-999/10359`.
 *
 * Wo nur eine ZAHL gebraucht wird, ist `count: 'exact'` die Antwort (so
 * in Block 101 fuer die Aufbewahrungslaeufe). Wo die ZEILEN selbst
 * gebraucht werden — die Leistungen eines Abrechnungsmonats — hilft keine
 * Zahl: es muessen alle sein. Dafuer ist `leseAlle()` da.
 *
 * Geprueft wird hier das Verhalten des Seitenlesers selbst. Der Zaehler
 * der Seiten ist dabei kein Beiwerk: er ist der Beleg, dass ueberhaupt
 * geblaettert wurde.
 */
import { describe, it, expect, vi } from 'vitest'
import { leseAlle, SEITENGROESSE, MAX_ZEILEN } from '../../lib/db/alle-zeilen'

/** Eine Tabelle mit `n` Zeilen, die sich wie PostgREST verhaelt. */
function tabelle(n: number, fehlerAbSeite?: number) {
  const zeilen = Array.from({ length: n }, (_, i) => ({ id: i }))
  const bereiche: [number, number][] = []
  let seiten = 0
  const baue = vi.fn(async (von: number, bis: number) => {
    seiten++
    bereiche.push([von, bis])
    if (fehlerAbSeite && seiten >= fehlerAbSeite) {
      return { data: null, error: { message: 'Verbindung weg' } }
    }
    return { data: zeilen.slice(von, bis + 1), error: null }
  })
  return { baue, bereiche, gesamt: () => seiten }
}

describe('leseAlle blaettert, bis nichts mehr kommt', () => {
  it('holt eine kurze Tabelle in einem Zug', async () => {
    const t = tabelle(12)
    const r = await leseAlle(t.baue, { seitengroesse: 100 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.zeilen).toHaveLength(12)
    expect(r.ok && r.seiten).toBe(1)
  })

  it('holt ueber die Deckelgrenze hinaus — der Kern des Befundes', async () => {
    // 2 835 ist keine ausgedachte Zahl: so viele page_views waren am
    // 14.09.2026 aelter als 90 Tage. Eine ungeblaetterte Abfrage haette
    // 1000 geliefert und der Aufrufer haette mit 1000 weitergerechnet.
    const t = tabelle(2835)
    const r = await leseAlle(t.baue, { seitengroesse: SEITENGROESSE })
    expect(r.ok).toBe(true)
    expect(r.ok && r.zeilen).toHaveLength(2835)
    expect(r.ok && r.seiten).toBe(3)
  })

  it('fragt fortlaufende Bereiche ab, ohne Luecke und ohne Doppelung', async () => {
    const t = tabelle(2500)
    await leseAlle(t.baue, { seitengroesse: 1000 })
    expect(t.bereiche).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('braucht bei genau voller letzter Seite einen leeren Nachschlag', async () => {
    // Eine volle Seite ist von „das war die letzte" nicht zu
    // unterscheiden. Der zusaetzliche Aufruf ist der Preis dafuer, sich
    // nicht auf einen Zaehler zu verlassen, der zwischen den Seiten
    // ohnehin wandern kann.
    const t = tabelle(2000)
    const r = await leseAlle(t.baue, { seitengroesse: 1000 })
    expect(r.ok && r.zeilen).toHaveLength(2000)
    expect(r.ok && r.seiten).toBe(3)
  })

  it('liefert bei leerer Tabelle eine leere Liste, keinen Fehler', async () => {
    const t = tabelle(0)
    const r = await leseAlle(t.baue, { seitengroesse: 100 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.zeilen).toEqual([])
  })
})

describe('leseAlle liefert NIE eine gekuerzte Liste', () => {
  it('meldet den Fehler, statt das bisher Gelesene zurueckzugeben', async () => {
    // Eine halbe Liste mit ok:true waere genau der Befund, gegen den
    // dieses Modul gebaut ist — nur mit mehr Zeilen.
    const t = tabelle(5000, 3)
    const r = await leseAlle(t.baue, { seitengroesse: 1000 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.grund).toContain('Verbindung weg')
    // Wie weit er kam, gehoert in die Meldung — nicht in ein Ergebnis.
    expect(r.ok === false && r.gelesen).toBe(2000)
  })

  it('bricht an der Sperre ab, statt gekuerzt zurueckzugeben', async () => {
    const t = tabelle(100_000)
    const r = await leseAlle(t.baue, { seitengroesse: 1000, maxZeilen: 3000 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.grund).toMatch(/Mehr als 3000/)
    expect(r.ok === false && r.grund).toMatch(/unvollstaendigen Bestand/)
  })

  it('die Sperre ist voreingestellt, nicht optional', async () => {
    expect(MAX_ZEILEN).toBeGreaterThan(SEITENGROESSE)
    const t = tabelle(MAX_ZEILEN + 5000)
    const r = await leseAlle(t.baue)
    expect(r.ok).toBe(false)
  })

  it('erreicht die Sperre NICHT, wenn der Bestand genau darunter liegt', async () => {
    const t = tabelle(2999)
    const r = await leseAlle(t.baue, { seitengroesse: 1000, maxZeilen: 3000 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.zeilen).toHaveLength(2999)
  })
})

describe('Die Geldwege blaettern', () => {
  it('der EDIFACT-Export liest die Leistungen seitenweise', async () => {
    const { readFileSync } = await import('node:fs')
    const quelle = readFileSync('lib/abrechnung/kassenabrechnung-engine.ts', 'utf8')
    const ab = quelle.indexOf('const recordsSeiten = await leseAlle')
    expect(ab, 'Seitenleser nicht verdrahtet').toBeGreaterThan(-1)
    const stelle = quelle.slice(ab, ab + 900)
    expect(stelle).toContain(".from('service_records')")
    expect(stelle).toContain('.range(von, bis)')
    // Und ein Fehler beendet den Export, statt ihn mit Teilbestand zu
    // fahren: eine unvollstaendige EDIFACT-Datei ist in sich stimmig und
    // deshalb nicht als unvollstaendig erkennbar.
    expect(quelle.slice(ab, ab + 1400)).toContain('throw new Error(')
  })

  it('der Probelauf ebenso', async () => {
    const { readFileSync } = await import('node:fs')
    const quelle = readFileSync('app/api/billing/dta/dry-run/route.ts', 'utf8')
    const ab = quelle.indexOf('const recordsSeiten = await leseAlle')
    expect(ab, 'Seitenleser nicht verdrahtet').toBeGreaterThan(-1)
    expect(quelle.slice(ab, ab + 900)).toContain('.range(von, bis)')
  })
})
