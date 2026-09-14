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
