// ═══════════════════════════════════════════════════════════════
// Welle 6 — KIM/TI-Typen (lib/kim/types.ts)
// ═══════════════════════════════════════════════════════════════
//
// Die drei Label-Tabellen sind die Anzeigeschicht über den
// CHECK-Constraints aus
// supabase/migrations/20260919000000_kim_ti_messaging.sql.
//
// TypeScript garantiert Vollständigkeit nur gegen die TS-Union — nicht
// gegen die Datenbank. Fügt eine Migration einen Status hinzu und die
// Union bleibt zurück, zeigt die Oberfläche für den neuen Zustand
// „undefined" an. Genau diese Lücke wird hier zur Laufzeit geschlossen.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  KIM_MESSAGE_STATUS_LABELS,
  KIM_MESSAGE_TYPE_LABELS,
  KIM_ADDRESS_TYPE_LABELS,
} from '../kim/types'

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260919000000_kim_ti_messaging.sql'),
  'utf8',
)

/** Werte eines CHECK (spalte IN ('a','b',…)) aus dem Migrations-SQL. */
function checkWerte(spalte: string): string[] {
  const re = new RegExp(`CHECK\\s*\\(${spalte}\\s+IN\\s*\\(([^)]*)\\)`)
  const m = SQL.match(re)
  assert.ok(m, `CHECK für "${spalte}" nicht in der Migration gefunden`)
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
}

const TABELLEN: Record<string, { labels: Record<string, string>; spalte: string }> = {
  KIM_MESSAGE_STATUS_LABELS: { labels: KIM_MESSAGE_STATUS_LABELS, spalte: 'status' },
  KIM_MESSAGE_TYPE_LABELS: { labels: KIM_MESSAGE_TYPE_LABELS, spalte: 'message_type' },
  KIM_ADDRESS_TYPE_LABELS: { labels: KIM_ADDRESS_TYPE_LABELS, spalte: 'address_type' },
}

// ───────────────────────────────────────────────────────────────
describe('Label-Tabellen — Grundform', () => {
  for (const [name, { labels }] of Object.entries(TABELLEN)) {
    test(`${name}: nicht leer`, () => {
      assert.ok(Object.keys(labels).length > 0)
    })

    test(`${name}: jedes Label ist gefüllter Text`, () => {
      for (const [k, v] of Object.entries(labels)) {
        assert.equal(typeof v, 'string', `${k} ist kein String`)
        assert.ok(v.trim().length > 0, `${k} hat ein leeres Label`)
        assert.equal(v, v.trim(), `${k} ist nicht getrimmt`)
      }
    })

    test(`${name}: Labels sind eindeutig`, () => {
      const werte = Object.values(labels)
      assert.equal(new Set(werte).size, werte.length, `Doppelte Labels in ${name}`)
    })

    test(`${name}: Schlüssel sind kleingeschriebene Datenbankwerte`, () => {
      for (const k of Object.keys(labels)) {
        assert.match(k, /^[a-z][a-z_]*$/, `Schlüssel "${k}" sieht nicht wie ein DB-Wert aus`)
      }
    })

    test(`${name}: Label unterscheidet sich vom rohen Schlüssel`, () => {
      // Sonst wäre die Tabelle wirkungslos und die Oberfläche zeigte
      // weiterhin den Datenbankwert an.
      const identisch = Object.entries(labels).filter(([k, v]) => k === v)
      assert.deepEqual(identisch, [])
    })
  }
})

// ───────────────────────────────────────────────────────────────
describe('Label-Tabellen decken die CHECK-Constraints ab', () => {
  test('kim_messages.status', () => {
    assert.deepEqual(
      Object.keys(KIM_MESSAGE_STATUS_LABELS).sort(),
      checkWerte('status').sort(),
    )
  })

  test('kim_messages.message_type', () => {
    assert.deepEqual(
      Object.keys(KIM_MESSAGE_TYPE_LABELS).sort(),
      checkWerte('message_type').sort(),
    )
  })

  test('kim_addresses.address_type', () => {
    assert.deepEqual(
      Object.keys(KIM_ADDRESS_TYPE_LABELS).sort(),
      checkWerte('address_type').sort(),
    )
  })
})

// ───────────────────────────────────────────────────────────────
describe('Statusfolge der Nachricht', () => {
  test('kennt Entwurf als Anfang und die drei Endzustände', () => {
    for (const s of ['entwurf', 'zugestellt', 'fehler', 'storniert']) {
      assert.ok(s in KIM_MESSAGE_STATUS_LABELS, `Status "${s}" fehlt`)
    }
  })

  test('trennt „gesendet" von „zugestellt" — sonst wäre Zustellung nicht ablesbar', () => {
    assert.ok('gesendet' in KIM_MESSAGE_STATUS_LABELS)
    assert.ok('zugestellt' in KIM_MESSAGE_STATUS_LABELS)
    assert.notEqual(KIM_MESSAGE_STATUS_LABELS.gesendet, KIM_MESSAGE_STATUS_LABELS.zugestellt)
  })

  test('Nachrichtenarten decken die medizinischen Dokumenttypen ab', () => {
    for (const t of ['arztbrief', 'verordnung', 'befund', 'abrechnung', 'sonstig']) {
      assert.ok(t in KIM_MESSAGE_TYPE_LABELS, `Art "${t}" fehlt`)
    }
  })

  test('Adressarten unterscheiden Arzt, Kasse und Leistungserbringer', () => {
    for (const t of ['arzt', 'kasse', 'leistungserbringer', 'sonstig']) {
      assert.ok(t in KIM_ADDRESS_TYPE_LABELS, `Adressart "${t}" fehlt`)
    }
    assert.notEqual(KIM_ADDRESS_TYPE_LABELS.arzt, KIM_ADDRESS_TYPE_LABELS.leistungserbringer)
  })
})
