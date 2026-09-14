/**
 * Kassen-Versand — die Datei war draussen, der Auftrag wusste es nicht
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 62, 14.09.2026)
 *
 * `zaehleVersuch()` schreibt weit mehr als einen Zaehler: ueber
 * `weitereFelder` kommt der STATUS des Auftrags mit — nach einer
 * erfolgreichen Uebertragung 'uebermittelt' samt `uebermittelt_am`,
 * Nutzdaten-Hash und Groesse.
 *
 * Der Schreibvorgang verwarf Fehler UND getroffene Zeilen. Schlug er
 * still fehl, lag die Datei bei der Datenannahmestelle, waehrend der
 * Auftrag in seinem alten Status stehenblieb — der naechste Lauf haette
 * dieselbe Abrechnung ERNEUT geschickt.
 *
 * Und der Zaehler selbst ist laut Funktionskopf die Zahl, „an der spaeter
 * auffaellt, dass eine Annahmestelle systematisch ablehnt". Waechst sie
 * nicht, ist genau diese Beobachtung tot.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const MODUL = readFileSync('lib/abrechnung/versand.ts', 'utf8')

const ZAEHLER = (() => {
  const ab = MODUL.indexOf('async function zaehleVersuch(')
  expect(ab, 'zaehleVersuch nicht gefunden').toBeGreaterThan(-1)
  return MODUL.slice(ab, MODUL.indexOf('\n/**', ab))
})()

describe('zaehleVersuch meldet seinen Ausgang', () => {
  it('gibt Erfolg oder Grund zurueck, statt void', () => {
    expect(ZAEHLER).toContain('Promise<{ ok: true } | { ok: false; grund: string }>')
  })

  it('prueft den Fehler', () => {
    expect(ZAEHLER).toContain('error: zaehlFehler')
  })

  it('und die getroffenen Zeilen', () => {
    // PostgREST meldet null getroffene Zeilen nicht als Fehler.
    expect(ZAEHLER).toContain("gezaehlt?.length ?? 0) === 0")
  })

  it('kein blindes `await supabase` mehr', () => {
    expect(ZAEHLER).not.toMatch(/\n\s*await supabase\s*\n\s*\.from\('dta_dakota_auftraege'\)/)
  })
})

describe('der Erfolgsfall ist der gefaehrliche', () => {
  const STELLE = (() => {
    const ab = MODUL.indexOf('const statusVermerk = await zaehleVersuch(')
    expect(ab, 'Aufruf nach der Uebertragung nicht gefunden').toBeGreaterThan(-1)
    return MODUL.slice(ab, ab + 2200)
  })()

  it('unterscheidet Erfolg und Fehlschlag der Uebertragung', () => {
    expect(STELLE).toContain('ergebnis.erfolg')
  })

  it('sagt bei uebermittelter Datei ausdruecklich: NICHT erneut versenden', () => {
    const text = STELLE.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('UEBERMITTELT')
    expect(text).toContain('NICHT erneut versendet')
  })

  it('und beim gescheiterten Versuch: der Zaehler stimmt nicht', () => {
    const text = STELLE.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('Versuchszaehler stimmt nicht')
  })

  it('schreibt den Hinweis ins Protokoll, nicht nur ins Log', () => {
    // Das Protokoll geht an den Aufrufer zurueck; im Log sucht nach einer
    // doppelten Einreichung niemand.
    expect(STELLE).toContain('protokoll.push(satz)')
    expect(STELLE).toContain('log(satz)')
  })

  it('bricht NICHT ab — die Datei laesst sich nicht zurueckholen', () => {
    expect(STELLE).not.toContain('throw new Error(')
  })
})

describe('auch der Gate-Abbruch vermerkt seinen Ausgang', () => {
  it('meldet, wenn der Auftrag nicht in den neuen Status kam', () => {
    const ab = MODUL.indexOf('const vermerk = await zaehleVersuch(')
    expect(ab).toBeGreaterThan(-1)
    const text = MODUL.slice(ab, ab + 900).replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ')
    expect(text).toContain('steht weiter in seinem alten Status')
  })
})
