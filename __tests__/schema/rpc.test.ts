/**
 * Block 40 — RPC-Aufrufe, die es so nicht gibt
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Die vierte Achse. Sie ist die tückischste, weil der Fehler hier NICHT
 * wirft:
 *
 *     const { error } = await supabase.rpc('gibtesnicht', { a: 1 })
 *
 * `rpc()` liefert ein Fehlerobjekt und keine Ausnahme. Ein `try/catch`
 * darum herum ist toter Code, und wer `error` nicht ansieht, merkt
 * nichts. Genau so wurde in diesem Projekt einmal ein Referral-Bonus nie
 * gebucht.
 *
 * Ergebnis des ersten Laufs: 387 Funktionen, ein Treffer —
 * `rpc('version')` im Health-Check. `version()` liegt in `pg_catalog`,
 * PostgREST exponiert nur `public`; der Aufruf beantwortete JEDEN
 * Health-Check mit PGRST202 (live geprüft). Null Abweichungen bei den
 * Argumentnamen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pruefeRpc } from '@/lib/schema/rpc'

const funktionen = new Map<string, ReadonlySet<string>>([
  ['create_invoice_atomic', new Set(['p_client_id', 'p_monat'])],
  ['cron_check_ueberfaellige_aufgaben', new Set()],
])

describe('pruefeRpc', () => {
  it('meldet eine Funktion, die es nicht gibt', () => {
    const b = pruefeRpc('a.ts', "await db.rpc('gibtesnicht')", funktionen)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ funktion: 'gibtesnicht', argument: null })
  })

  it('schweigt bei einer Funktion ohne Argumente', () => {
    expect(pruefeRpc('a.ts', "await db.rpc('cron_check_ueberfaellige_aufgaben')", funktionen)).toHaveLength(0)
  })

  it('meldet ein Argument, das die Funktion nicht kennt', () => {
    const q = "await db.rpc('create_invoice_atomic', { p_client_id: x, p_falsch: 1 })"
    const b = pruefeRpc('a.ts', q, funktionen)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ funktion: 'create_invoice_atomic', argument: 'p_falsch' })
    expect(b[0].erlaubt).toContain('p_monat')
  })

  it('schweigt bei korrekten Argumenten', () => {
    const q = "await db.rpc('create_invoice_atomic', { p_client_id: x, p_monat: '2026-09' })"
    expect(pruefeRpc('a.ts', q, funktionen)).toHaveLength(0)
  })

  it('hält einen Wert aus einem String nicht für ein Argument', () => {
    const q = "await db.rpc('create_invoice_atomic', { p_monat: `Stand: ${x}` })"
    expect(pruefeRpc('a.ts', q, funktionen)).toHaveLength(0)
  })

  it('auch dann nicht, wenn der String selbst wie ein Feld aussieht', () => {
    // Der entscheidende Fall: ein Komma IM String, gefolgt von `wort:`.
    // Die Anker-Regel allein reicht dafür nicht — der Text muss vorher
    // neutralisiert werden. Ohne das wäre `grund` ein Argumentname.
    const q = "await db.rpc('create_invoice_atomic', { p_monat: 'Monat, grund: unklar' })"
    expect(pruefeRpc('a.ts', q, funktionen)).toHaveLength(0)
  })

  it('fängt kein Ternär als Argumentnamen', () => {
    const q = "await db.rpc('create_invoice_atomic', { p_monat: a ? treffer : null })"
    expect(pruefeRpc('a.ts', q, funktionen)).toHaveLength(0)
  })

  it('sieht nicht in verschachtelte Objekte hinein', () => {
    // Der Inhalt ist JSONB-Nutzlast, kein Argumentname.
    const q = "await db.rpc('create_invoice_atomic', { p_monat: { tief: 1 } })"
    expect(pruefeRpc('a.ts', q, funktionen)).toHaveLength(0)
  })

  it('liest keinen Aufruf aus einem Kommentar', () => {
    expect(pruefeRpc('a.ts', "// db.rpc('gibtesnicht')\nconst a = 1", funktionen)).toHaveLength(0)
  })

  it('nennt die Zeilennummer', () => {
    expect(pruefeRpc('a.ts', "\n\ndb.rpc('gibtesnicht')", funktionen)[0].zeile).toBe(3)
  })
})

describe('Der Befund aus Block 40 — als Regression festgehalten', () => {
  it('der Health-Check ruft kein version() mehr', () => {
    // Es liegt in pg_catalog; PostgREST exponiert nur public. Der Aufruf
    // beantwortete jeden Health-Check mit PGRST202 und hinterliess einen
    // Fehler im Protokoll.
    const s = readFileSync(resolve(__dirname, '../../app/api/health/route.ts'), 'utf-8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(s).not.toMatch(/rpc\(\s*'version'/)
  })

  it('er prüft die Datenbank weiterhin — über ein Select', () => {
    const s = readFileSync(resolve(__dirname, '../../app/api/health/route.ts'), 'utf-8')
    expect(s).toMatch(/from\('profiles'\)/)
    expect(s).toMatch(/Datenbankverbindung fehlgeschlagen/)
  })
})
