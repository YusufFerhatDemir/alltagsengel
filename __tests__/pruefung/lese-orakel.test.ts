/**
 * Lese-Orakel — Messwert von Stoerung unterscheiden
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 50, 14.09.2026)
 *
 * `public._run_sql` gibt seinen Messwert per `RAISE EXCEPTION` zurueck.
 * PostgREST liefert das als
 *
 *     HTTP 400  {"code":"P0001","message":"<Messwert>"}
 *
 * Ein Fehler sieht fast genauso aus:
 *
 *     HTTP 401  {"message":"Invalid API key"}
 *
 * Beide tragen `message`. 43 von 45 Prueflaeufen lasen nur `message`.
 *
 * Mit absichtlich verfaelschten Schluesseln gemessen: VIER Laeufe
 * meldeten trotzdem exit 0 — darunter `verify-security-p0.mjs`, in den
 * Notizen als „9/9 gruen" gefuehrt, und der in Block 47 von mir selbst
 * gebaute `verify-migrationsstand.ts`. Er berichtete „alle sechs
 * Migrationen OFFEN" ueber eine Datenbank, die er nie erreicht hatte.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error — geteilter Helfer der Pruefskripte, JavaScript mit .d.ts
import { deuteOrakelAntwort, ORAKEL_CODE, POSITIVKONTROLLE_TABELLE } from '../../scripts/lib/lese-orakel.mjs'

const antwort = (o: unknown) => JSON.stringify(o)

describe('deuteOrakelAntwort — der Messwert', () => {
  it('nimmt eine Antwort mit code P0001 als Messwert', () => {
    const r = deuteOrakelAntwort(400, antwort({ code: 'P0001', message: 'ZAHL=7' }))
    expect(r.ok).toBe(true)
    expect(r.wert).toBe('ZAHL=7')
  })

  it('nimmt auch einen leeren Messwert an — „nichts gefunden" ist ein Ergebnis', () => {
    const r = deuteOrakelAntwort(400, antwort({ code: 'P0001', message: '' }))
    expect(r.ok).toBe(true)
    expect(r.wert).toBe('')
  })

  it('P0001 ist der Beweis, dass der DO-Block gelaufen ist', () => {
    expect(ORAKEL_CODE).toBe('P0001')
  })
})

describe('deuteOrakelAntwort — die Stoerung', () => {
  it('weist „Invalid API key" ab, obwohl es ein `message`-Feld traegt', () => {
    // Genau hier waren vier Laeufe blind.
    const r = deuteOrakelAntwort(401, antwort({ message: 'Invalid API key', hint: 'x' }))
    expect(r.ok).toBe(false)
    expect(r.grund).toContain('NICHTS gemessen')
  })

  it('erkennt den 401 auch ohne passenden Text', () => {
    expect(deuteOrakelAntwort(401, antwort({ foo: 'bar' })).ok).toBe(false)
  })

  it('nennt bei PGRST202 den haeufigsten Grund beim Namen', () => {
    // Das Orakel nimmt `p`, nicht `query` — ein falscher Parametername
    // sieht aus, als gaebe es die Funktion nicht.
    const r = deuteOrakelAntwort(404, antwort({ code: 'PGRST202', message: 'Could not find' }))
    expect(r.ok).toBe(false)
    expect(r.grund).toContain('`p`, nicht `query`')
  })

  it('weist eine Antwort ohne code ab, auch bei HTTP 200', () => {
    // Fail-closed: ohne P0001 ist nichts belegt.
    expect(deuteOrakelAntwort(200, antwort({ message: 'irgendwas' })).ok).toBe(false)
  })

  it('weist einen anderen Fehlercode ab', () => {
    expect(deuteOrakelAntwort(400, antwort({ code: '42501', message: 'permission denied' })).ok).toBe(false)
  })

  it('weist eine Antwort ab, die kein JSON ist', () => {
    const r = deuteOrakelAntwort(502, '<html>bad gateway</html>')
    expect(r.ok).toBe(false)
    expect(r.grund).toContain('kein JSON')
  })

  it('weist `message` als Nicht-Zeichenkette ab', () => {
    expect(deuteOrakelAntwort(400, antwort({ code: 'P0001', message: 42 })).ok).toBe(false)
  })
})

describe('die Positivkontrolle', () => {
  it('benutzt eine Tabelle, die anon laut Policy lesen darf', () => {
    // `bundeslaender` traegt `bundeslaender_read` fuer die Rolle anon —
    // am 14.09.2026 aus pg_policies gelesen.
    expect(POSITIVKONTROLLE_TABELLE).toBe('bundeslaender')
  })

  it('ist in den drei Laeufen verdrahtet, die Verweigerungen feststellen', () => {
    for (const datei of [
      'scripts/verify-security-p0.mjs',
      'scripts/verify-sql-exec-abgesichert.mjs',
      'scripts/verify-phase2-3-4-stabilisierung.mjs',
    ]) {
      const q = readFileSync(datei, 'utf8')
      expect(q, datei).toContain('pruefeAnonErreichbar(')
      expect(q, datei).toContain('process.exit(2)')
    }
  })

  it('erklaert, warum `status >= 400` allein nichts beweist', () => {
    const q = readFileSync('scripts/lib/lese-orakel.mjs', 'utf8')
    expect(q).toContain('401 ist auch >= 400')
  })
})

describe('der Blindtest selbst', () => {
  const q = readFileSync('scripts/verify-blindtest.mjs', 'utf8')

  it('verfaelscht BEIDE Schluessel', () => {
    // Ein erster Entwurf brach nur den geheimen — und hielt
    // verify-sql-exec-abgesichert.mjs faelschlich fuer blind, weil der
    // Lauf mit dem oeffentlichen Schluessel arbeitet.
    expect(q).toContain('SUPABASE_SECRET_KEY')
    expect(q).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })

  it('nimmt sich selbst aus der Liste', () => {
    expect(q).toContain("!d.endsWith('verify-blindtest.mjs')")
  })

  it('findet auch die Laeufe, die den HELFER benutzen', () => {
    // Ein erster Entwurf suchte nur das Literal `_run_sql` — und uebersah
    // damit genau die Skripte, die ueber frageOrakel() gehen, also die
    // richtig gebauten. Ein Detektor, der die gute Form nicht kennt,
    // schrumpft mit jeder Verbesserung.
    expect(q).toContain('_run_sql|frageOrakel')
  })

  it('faerbt eine Zeitgrenze NICHT rot, meldet sie aber', () => {
    // Eine Zeitgrenze ist eine Aussage ueber diesen Rechner, nicht ueber
    // den Prueflauf.
    expect(q).toContain('blind.length === 0 ? 0 : 1')
    expect(q).toContain('UNKLAR')
  })

  it('nennt den ueblichen Fehler und die richtige Stelle', () => {
    expect(q).toContain('nur `message`')
    expect(q).toContain('frageOrakel()')
  })

  it('ist als npm-Skript verdrahtet', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['verify:blindtest']).toBe('node scripts/verify-blindtest.mjs')
  })
})

describe('der in Block 47 gebaute Lauf benutzt jetzt den Helfer', () => {
  it('verify-migrationsstand liest nicht mehr blank `message`', () => {
    // Geprueft werden die ANWEISUNGEN, nicht der Fliesstext: der Kopf
    // zitiert `JSON.parse(roh).message` als Begruendung. Wer die
    // Kommentare mitliest, meldet die Erklaerung als Befund — derselbe
    // Fehler ist mir in Block 46 schon einmal unterlaufen.
    const q = readFileSync('scripts/verify-migrationsstand.ts', 'utf8')
    const anweisungen = q
      .split('\n')
      .filter(z => !/^\s*(\/\/|\*|\/\*)/.test(z))
      .join('\n')
    expect(anweisungen).toContain('frageOrakel(')
    expect(anweisungen).not.toContain('JSON.parse(roh).message')
  })
})
