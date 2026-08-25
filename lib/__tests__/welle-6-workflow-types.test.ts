// ═══════════════════════════════════════════════════════════════
// Welle 6 — Workflow-Typen (lib/workflow/types.ts)
// ═══════════════════════════════════════════════════════════════
//
// Die Wertelisten spiegeln laut Dateikopf 1:1 die CHECK-Constraints aus
// supabase/migrations/20260813010000_workflow_engine.sql. Genau das wird
// hier nachgerechnet: eine TS-Liste, die einen Wert kennt, den die
// Datenbank ablehnt, erzeugt einen 23514 erst zur Laufzeit — und
// umgekehrt lehnt assertErlaubt() dann einen gültigen Wert ab.
//
// Zusätzlich die einzige Funktion des Moduls: assertErlaubt.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  assertErlaubt,
  WF_MODUL_WERTE,
  WF_EVENT_STATUS_WERTE,
  WF_EVENT_PRIORITAET_WERTE,
  WF_AKTION_TYP_WERTE,
  WF_AUSFUEHRUNG_STATUS_WERTE,
  WF_QUEUE_STATUS_WERTE,
  WF_AUDIT_TYP_WERTE,
  WF_BEDINGUNG_OPERATOR_WERTE,
} from '../workflow/types'

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260813010000_workflow_engine.sql',
)

/**
 * Liest die Werte eines CHECK (spalte IN ('a','b',…)) aus dem SQL.
 * `nachTabelle` grenzt ein, falls derselbe Spaltenname mehrfach vorkommt.
 */
function checkWerte(sql: string, spalte: string, nachTabelle?: string): string[] {
  let text = sql
  if (nachTabelle) {
    const i = text.indexOf(nachTabelle)
    assert.ok(i >= 0, `Tabelle ${nachTabelle} nicht in der Migration gefunden`)
    text = text.slice(i)
  }
  const re = new RegExp(`${spalte}\\s+text[^,]*?CHECK\\s*\\(\\s*${spalte}\\s+IN\\s*\\(([\\s\\S]*?)\\)`, 'm')
  const m = text.match(re)
  assert.ok(m, `CHECK für Spalte "${spalte}" nicht gefunden`)
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
}

const SQL = readFileSync(MIGRATION, 'utf8')

// ───────────────────────────────────────────────────────────────
describe('Wertelisten — Grundform', () => {
  const listen: Record<string, string[]> = {
    WF_MODUL_WERTE,
    WF_EVENT_STATUS_WERTE,
    WF_EVENT_PRIORITAET_WERTE,
    WF_AKTION_TYP_WERTE,
    WF_AUSFUEHRUNG_STATUS_WERTE,
    WF_QUEUE_STATUS_WERTE,
    WF_AUDIT_TYP_WERTE,
    WF_BEDINGUNG_OPERATOR_WERTE,
  }

  for (const [name, liste] of Object.entries(listen)) {
    test(`${name}: nicht leer und dublettenfrei`, () => {
      assert.ok(liste.length > 0)
      assert.equal(new Set(liste).size, liste.length, `Dubletten in ${name}`)
    })

    test(`${name}: keine leeren oder ungetrimmten Werte`, () => {
      for (const w of liste) {
        assert.ok(w.length > 0, `${name} enthält einen leeren Wert`)
        assert.equal(w, w.trim(), `"${w}" in ${name} ist nicht getrimmt`)
      }
    })
  }
})

// ───────────────────────────────────────────────────────────────
describe('Wertelisten decken sich mit den CHECK-Constraints der Migration', () => {
  test('wf_events.modul', () => {
    assert.deepEqual(WF_MODUL_WERTE, checkWerte(SQL, 'modul', 'wf_events'))
  })

  test('wf_events.status', () => {
    assert.deepEqual(WF_EVENT_STATUS_WERTE, checkWerte(SQL, 'status', 'wf_events'))
  })

  test('wf_events.prioritaet', () => {
    assert.deepEqual(WF_EVENT_PRIORITAET_WERTE, checkWerte(SQL, 'prioritaet', 'wf_events'))
  })

  test('wf_regeln.modul benutzt dieselbe Modul-Liste', () => {
    assert.deepEqual(WF_MODUL_WERTE, checkWerte(SQL, 'modul', 'wf_regeln'))
  })

  test('wf_aktionen.typ', () => {
    assert.deepEqual(WF_AKTION_TYP_WERTE, checkWerte(SQL, 'typ', 'wf_aktionen'))
  })

  test('wf_ausfuehrungen.status', () => {
    assert.deepEqual(WF_AUSFUEHRUNG_STATUS_WERTE, checkWerte(SQL, 'status', 'wf_ausfuehrungen'))
  })

  test('wf_warteschlange.status', () => {
    assert.deepEqual(WF_QUEUE_STATUS_WERTE, checkWerte(SQL, 'status', 'wf_warteschlange'))
  })

  test('wf_audit_log.typ', () => {
    assert.deepEqual(WF_AUDIT_TYP_WERTE, checkWerte(SQL, 'typ', 'wf_audit_log'))
  })

  test('dead_letter ist als Queue-Endzustand in beiden Welten bekannt', () => {
    assert.ok(WF_QUEUE_STATUS_WERTE.includes('dead_letter'))
    assert.ok(WF_AUDIT_TYP_WERTE.includes('dead_letter'))
  })
})

// ───────────────────────────────────────────────────────────────
describe('assertErlaubt', () => {
  test('lässt jeden verzeichneten Wert durch', () => {
    for (const w of WF_MODUL_WERTE) {
      assert.doesNotThrow(() => assertErlaubt(w, WF_MODUL_WERTE, 'modul'))
    }
  })

  test('null und undefined passieren — die Spalte darf optional sein', () => {
    assert.doesNotThrow(() => assertErlaubt(null, WF_MODUL_WERTE, 'modul'))
    assert.doesNotThrow(() => assertErlaubt(undefined, WF_MODUL_WERTE, 'modul'))
  })

  test('unbekannter Wert wirft', () => {
    assert.throws(() => assertErlaubt('buchhaltung' as never, WF_MODUL_WERTE, 'modul'))
  })

  test('die Fehlermeldung nennt Feld, Wert und die erlaubten Werte', () => {
    assert.throws(
      () => assertErlaubt('buchhaltung' as never, WF_MODUL_WERTE, 'modul'),
      (e: unknown) => {
        assert.ok(e instanceof Error)
        assert.ok(e.message.includes('buchhaltung'))
        assert.ok(e.message.includes('modul'))
        assert.ok(e.message.includes('abrechnung'))
        return true
      },
    )
  })

  test('unterscheidet Groß-/Kleinschreibung', () => {
    assert.throws(() => assertErlaubt('Abrechnung' as never, WF_MODUL_WERTE, 'modul'))
  })

  test('Leerstring ist kein erlaubter Wert', () => {
    assert.throws(() => assertErlaubt('' as never, WF_MODUL_WERTE, 'modul'))
  })

  test('greift für jede Werteliste gleich', () => {
    assert.doesNotThrow(() => assertErlaubt('dead_letter', WF_QUEUE_STATUS_WERTE, 'status'))
    assert.throws(() => assertErlaubt('dead_letter' as never, WF_EVENT_STATUS_WERTE, 'status'))
  })

  test('Operatoren-Liste greift auch bei Sonderzeichen-Werten', () => {
    assert.doesNotThrow(() => assertErlaubt('>=', WF_BEDINGUNG_OPERATOR_WERTE, 'operator'))
    assert.doesNotThrow(() => assertErlaubt('enthält', WF_BEDINGUNG_OPERATOR_WERTE, 'operator'))
    assert.throws(() => assertErlaubt('==' as never, WF_BEDINGUNG_OPERATOR_WERTE, 'operator'))
  })
})
