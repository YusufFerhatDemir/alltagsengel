/**
 * Block 38 — Schreibvorgänge auf Spalten, die es nicht gibt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die Schwester des Vokabular-Detektors. Warum beide nötig sind, zeigte
 * die erste Messung: die Referral-Benachrichtigung schrieb
 * `type: 'referral'` (verbotener Wert, Block 37) UND `message:` (die
 * Spalte heißt `body`). Nach der Behebung des Wertes meldete die
 * Wert-Prüfung die Stelle als sauber — die Benachrichtigung kam trotzdem
 * nicht an.
 *
 * Sechs Befunde im ersten Lauf, jeder ein vollständiger Funktionsausfall:
 *
 *   mis_applicants.created_by        Bewerber anlegen scheiterte
 *   mis_job_postings.created_by      Stellenausschreibung scheiterte
 *   mis_privacy_records.created_by   Verarbeitungsverzeichnis (Art. 30)
 *   mis_privacy_consents.created_by  Einwilligung erfassen
 *   mis_privacy_consents.updated_at  Einwilligung WIDERRUFEN
 *   mis_privacy_requests.created_by  Betroffenenanfrage (Art. 15–22)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pruefeSpalten, obersteEbene, spaltenAusOpenApi } from '@/lib/schema/spalten'

const spalten = new Map<string, ReadonlySet<string>>([
  ['notifications', new Set(['id', 'user_id', 'type', 'title', 'body'])],
  ['mis_applicants', new Set(['id', 'first_name', 'status'])],
])

describe('obersteEbene — die drei Blindheiten beim Bau', () => {
  it('neutralisiert Strings — ein deutscher Satz ist keine Spalte', () => {
    // Fehlversuch 1: `Nachweis fehlt: ${x}` lieferte `fehlt` als Spalte.
    const r = obersteEbene('{ body: `Nachweis fehlt: ${x}`, type: "a" }')
    expect(r).not.toMatch(/fehlt/)
    expect(r).toMatch(/body/)
  })

  it('kürzt verschachtelte Objekte, aber NICHT das äußere', () => {
    // Fehlversuch 2: die Kürzung fraß das ganze Objekt — der Detektor
    // meldete 0 Befunde und sah aus wie ein sauberes Ergebnis.
    const r = obersteEbene('{ data: { tief: 1 }, body: "x" }')
    expect(r).toMatch(/data/)
    expect(r).toMatch(/body/)
    expect(r).not.toMatch(/tief/)
  })

  it('kommt mit mehreren Verschachtelungsebenen zurecht', () => {
    const r = obersteEbene('{ a: { b: { c: { d: 1 } } }, e: 2 }')
    expect(r).toMatch(/a/)
    expect(r).toMatch(/e/)
    expect(r).not.toMatch(/d:/)
  })
})

describe('pruefeSpalten', () => {
  it('meldet eine Spalte, die es nicht gibt', () => {
    const q = "await db.from('notifications').insert({ user_id: x, message: 'hallo' })"
    const b = pruefeSpalten('a.ts', q, spalten)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ tabelle: 'notifications', spalte: 'message' })
  })

  it('schweigt bei der richtigen Spalte', () => {
    const q = "await db.from('notifications').insert({ user_id: x, body: 'hallo' })"
    expect(pruefeSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('fängt kein Ternär als Feldnamen', () => {
    // Fehlversuch 3: `bedingung ? wert : null` lieferte `wert` als Spalte.
    const q = "await db.from('notifications').insert({ body: a ? treffer : null })"
    expect(pruefeSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('überspringt Tabellen, die die API nicht kennt', () => {
    // Views und nicht exponierte Schemata. Eine Vermutung wäre schlechter
    // als Schweigen.
    const q = "await db.from('unbekannte_sicht').insert({ irgendwas: 1 })"
    expect(pruefeSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('ordnet nicht über eine Anweisungsgrenze hinweg zu', () => {
    const q = `
      await db.from('notifications').select('id')
      await db.from('mis_applicants').insert({ first_name: 'A' })
    `
    expect(pruefeSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('liest keine Felder aus Kommentaren', () => {
    const q = "// db.from('notifications').insert({ message: 'x' })\nconst a = 1"
    expect(pruefeSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('erkennt insert, update und upsert', () => {
    for (const methode of ['insert', 'update', 'upsert']) {
      const q = `db.from('notifications').${methode}({ message: 'x' })`
      expect(pruefeSpalten('a.ts', q, spalten), methode).toHaveLength(1)
    }
  })
})

describe('spaltenAusOpenApi', () => {
  it('baut die Zuordnung aus definitions', () => {
    const k = spaltenAusOpenApi({ definitions: { t: { properties: { a: {}, b: {} } } } })
    expect([...(k.get('t') ?? [])]).toEqual(['a', 'b'])
  })

  it('verträgt eine Antwort ohne definitions', () => {
    expect(spaltenAusOpenApi({}).size).toBe(0)
    expect(spaltenAusOpenApi(null).size).toBe(0)
  })
})

describe('Die sechs Befunde — als Regression festgehalten', () => {
  const quelle = (rel: string) =>
    readFileSync(resolve(__dirname, '../..', rel), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('die Bonus-Nachricht schreibt body, nicht message', () => {
    const s = quelle('app/api/referral/complete/route.ts')
    expect(s).toMatch(/body: `Deine Empfehlung/)
    expect(s).not.toMatch(/message: `Deine Empfehlung/)
  })

  it('das Bewerbermodul schreibt kein created_by mehr', () => {
    expect(quelle('app/mis/recruiting/actions.ts')).not.toMatch(/created_by: userId/)
  })

  it('das Datenschutzmodul schreibt kein created_by mehr', () => {
    expect(quelle('app/mis/privacy/actions.ts')).not.toMatch(/created_by: userId/)
  })

  it('der Widerruf einer Einwilligung setzt kein updated_at', () => {
    const s = quelle('app/mis/privacy/actions.ts')
    const block = s.slice(s.indexOf("from('mis_privacy_consents')\n      .update("))
    expect(block.slice(0, 400)).not.toMatch(/updated_at/)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Block 39 — die Leseseite
// ═══════════════════════════════════════════════════════════════════════
//
// Eine unbekannte Spalte in `.select()` scheitert genauso mit 42703 wie
// beim Schreiben — nur ist die Folge schlimmer: der Fehler wird meist
// verschluckt, die Liste kommt leer zurück, und die Oberfläche zeigt
// einen Leerzustand. Genau die stille Null.
//
// Ergebnis des ersten Laufs: SAUBER, null Befunde. Das ist geprüft und
// nicht bloß behauptet — die Gegenprobe mit einer eingebauten
// Falschspalte in app/kunde/leistungsnachweis/page.tsx wurde gefunden.
import { pruefeLeseSpalten, auswahlFelder } from '@/lib/schema/spalten'

describe('auswahlFelder — die Auswahl zerlegen', () => {
  it('liest eine einfache Liste', () => {
    expect(auswahlFelder('id, date, amount')).toEqual(['id', 'date', 'amount'])
  })

  it('löst einen Alias auf', () => {
    expect(auswahlFelder('betrag:amount')).toEqual(['amount'])
  })

  it('klammert Einbettungen samt Inhalt aus', () => {
    // Der Inhalt gehört einer ANDEREN Tabelle.
    expect(auswahlFelder('id, kunde:profiles!customer_id(first_name, last_name), date'))
      .toEqual(['id', 'date'])
  })

  it('klammert auch eine Einbettung mit DREI Feldern aus', () => {
    // Der entscheidende Fall: beim Zerlegen an Kommata entsteht aus
    // `t(a, b, c)` ein Segment `b` ganz OHNE Klammer. Es rutscht durch
    // jeden Klammerfilter und sähe aus wie eine Spalte der äußeren
    // Tabelle. Bei zwei Feldern tritt das nicht auf — deshalb prüfte der
    // ursprüngliche Test nichts.
    expect(auswahlFelder('id, kunde:profiles(vorname, mitte, nachname), date'))
      .toEqual(['id', 'date'])
  })

  it('klammert auch die zweite PostgREST-Form aus', () => {
    expect(auswahlFelder('id, profiles:customer_id(first_name), date'))
      .toEqual(['id', 'date'])
  })

  it('lässt JSONB-Pfade weg statt sie für Spalten zu halten', () => {
    expect(auswahlFelder('id, metadata->>schluessel')).toEqual(['id'])
  })

  it('verträgt eine leere Auswahl', () => {
    expect(auswahlFelder('')).toEqual([])
  })
})

describe('pruefeLeseSpalten', () => {
  const spalten = new Map<string, ReadonlySet<string>>([
    ['service_records', new Set(['id', 'date', 'amount'])],
  ])

  it('meldet eine gelesene Spalte, die es nicht gibt', () => {
    const q = "db.from('service_records').select('id, gibtesnicht, date')"
    const b = pruefeLeseSpalten('a.ts', q, spalten)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ tabelle: 'service_records', spalte: 'gibtesnicht' })
  })

  it('schweigt bei einer korrekten Auswahl', () => {
    const q = "db.from('service_records').select('id, date, amount')"
    expect(pruefeLeseSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('prüft bei einem reinen * gar nichts', () => {
    const q = "db.from('service_records').select('*')"
    expect(pruefeLeseSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('prüft neben dem Stern sehr wohl weiter', () => {
    // `select('*, gibtesnicht')` scheitert genauso — der Stern macht die
    // Abfrage nicht unfehlbar.
    const q = "db.from('service_records').select('*, gibtesnicht')"
    expect(pruefeLeseSpalten('a.ts', q, spalten)).toHaveLength(1)
  })

  it('meldet keine Spalte aus einer Einbettung', () => {
    // Sie gehört der eingebetteten Tabelle — hier zu prüfen wäre
    // Falschalarm, und ein Detektor, der Falschalarm gibt, wird
    // abgeschaltet.
    const q = "db.from('service_records').select('id, profiles:customer_id(vorname_gibts_nicht)')"
    expect(pruefeLeseSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('überspringt unbekannte Tabellen', () => {
    const q = "db.from('irgendeine_sicht').select('was_auch_immer')"
    expect(pruefeLeseSpalten('a.ts', q, spalten)).toHaveLength(0)
  })

  it('liest keine Auswahl aus einem Kommentar', () => {
    const q = "// db.from('service_records').select('gibtesnicht')\nconst a = 1"
    expect(pruefeLeseSpalten('a.ts', q, spalten)).toHaveLength(0)
  })
})
