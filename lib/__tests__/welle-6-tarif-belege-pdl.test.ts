// ═══════════════════════════════════════════════════════════════
// Welle 6 — Belegverwaltung + PDL-Zeitraum
// (lib/billing/core/tarif-belege.ts, lib/analytics/pdl-cockpit.ts)
// ═══════════════════════════════════════════════════════════════
//
// Zwei Module, aus denen jeweils nur ein kleiner reiner Teil ohne
// Datenbank prüfbar ist — deshalb in einer Datei zusammengefasst:
//
//   tarif-belege:  istMigrationFehlt, MIGRATION_FEHLT_TEXT,
//                  BELEG_BUCKET, berechneSha256Hex
//   pdl-cockpit:   standardZeitraumAktuellerMonat
//
// Alles Übrige beider Module braucht einen Supabase-Client.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import {
  BELEG_BUCKET,
  MIGRATION_FEHLT_TEXT,
  istMigrationFehlt,
  berechneSha256Hex,
} from '../billing/core/tarif-belege'
import { standardZeitraumAktuellerMonat } from '../analytics/pdl-cockpit'

// ───────────────────────────────────────────────────────────────
describe('BELEG_BUCKET', () => {
  test('ist ein gültiger Storage-Bucket-Name', () => {
    assert.equal(BELEG_BUCKET, 'tarif-belege')
    assert.match(BELEG_BUCKET, /^[a-z0-9][a-z0-9-]*$/)
  })
})

// ───────────────────────────────────────────────────────────────
describe('istMigrationFehlt', () => {
  test('erkennt den PostgREST-Schema-Cache-Fehler', () => {
    assert.equal(istMigrationFehlt('Could not find the table \'public.billing_tarif_belege\' in the schema cache'), true)
  })

  test('erkennt die einzelnen Kennzeichen', () => {
    for (const m of [
      'could not find the table',
      'schema cache',
      'does not exist',
      'relation "public.billing_tarif_belege" does not exist',
      'Bucket not found',
    ]) {
      assert.equal(istMigrationFehlt(m), true, `"${m}" nicht erkannt`)
    }
  })

  test('ist unabhängig von der Groß-/Kleinschreibung', () => {
    assert.equal(istMigrationFehlt('SCHEMA CACHE'), true)
    assert.equal(istMigrationFehlt('BUCKET NOT FOUND'), true)
  })

  test('leere Eingaben sind kein Migrationsfehler', () => {
    assert.equal(istMigrationFehlt(null), false)
    assert.equal(istMigrationFehlt(undefined), false)
    assert.equal(istMigrationFehlt(''), false)
  })

  test('andere Datenbankfehler werden NICHT als fehlende Migration ausgelegt', () => {
    // Sonst würde ein echter Rechtefehler dem Admin als „Migration fehlt"
    // gemeldet und die eigentliche Ursache verschwiegen.
    for (const m of [
      'new row violates row-level security policy',
      'duplicate key value violates unique constraint',
      'permission denied for table billing_tarif_belege',
      'JWT expired',
    ]) {
      assert.equal(istMigrationFehlt(m), false, `"${m}" fälschlich als Migrationsfehler erkannt`)
    }
  })

  test('erkennt den Fehler auch mitten in einer längeren Meldung', () => {
    assert.equal(
      istMigrationFehlt('PGRST205: Could not find the table in the schema cache. Hint: reload'),
      true,
    )
  })
})

describe('MIGRATION_FEHLT_TEXT', () => {
  test('nennt die konkrete Migration', () => {
    assert.ok(MIGRATION_FEHLT_TEXT.includes('20260904000000_tarif_belege_belegpflicht.sql'))
  })

  test('erklärt die Folge und benennt sie als gewollt', () => {
    assert.ok(MIGRATION_FEHLT_TEXT.includes('kein Beleg hochgeladen'))
    assert.ok(MIGRATION_FEHLT_TEXT.includes('fail-closed'))
  })

  test('ist ein vollständiger Satz für die Oberfläche, kein Fehlercode', () => {
    assert.ok(MIGRATION_FEHLT_TEXT.length > 100)
    assert.ok(MIGRATION_FEHLT_TEXT.trim().endsWith('.'))
  })
})

// ───────────────────────────────────────────────────────────────
describe('berechneSha256Hex', () => {
  const alsPuffer = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

  test('liefert 64 Hex-Zeichen in Kleinschreibung', async () => {
    const hex = await berechneSha256Hex(alsPuffer('Beleg'))
    assert.match(hex, /^[a-f0-9]{64}$/)
  })

  test('stimmt mit dem Node-Hash überein', async () => {
    for (const inhalt of ['', 'a', 'Beleg-Inhalt', 'Ümläute und Sonderzeichen: /\\%&']) {
      const erwartet = createHash('sha256').update(Buffer.from(inhalt, 'utf8')).digest('hex')
      assert.equal(await berechneSha256Hex(alsPuffer(inhalt)), erwartet, `Abweichung bei "${inhalt}"`)
    }
  })

  test('gleicher Inhalt ergibt denselben Hash', async () => {
    const a = await berechneSha256Hex(alsPuffer('gleich'))
    const b = await berechneSha256Hex(alsPuffer('gleich'))
    assert.equal(a, b)
  })

  test('ein geändertes Byte ändert den Hash', async () => {
    const a = await berechneSha256Hex(alsPuffer('Beleg'))
    const b = await berechneSha256Hex(alsPuffer('Belek'))
    assert.notEqual(a, b)
  })

  test('leerer Inhalt ergibt den bekannten SHA-256 des Leerstrings', async () => {
    assert.equal(
      await berechneSha256Hex(new ArrayBuffer(0)),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  test('das Ergebnis passt zum CHECK-Muster der Datenbank (^[a-f0-9]{64}$)', async () => {
    const hex = await berechneSha256Hex(alsPuffer('irgendwas'))
    assert.ok(/^[a-f0-9]{64}$/.test(hex))
  })
})

// ───────────────────────────────────────────────────────────────
describe('standardZeitraumAktuellerMonat', () => {
  test('liefert ISO-Daten', () => {
    const z = standardZeitraumAktuellerMonat()
    assert.match(z.von, /^\d{4}-\d{2}-\d{2}$/)
    assert.match(z.bis, /^\d{4}-\d{2}-\d{2}$/)
  })

  test('beginnt am Ersten des Monats', () => {
    assert.ok(standardZeitraumAktuellerMonat().von.endsWith('-01'))
  })

  test('von und bis liegen im selben Monat', () => {
    const z = standardZeitraumAktuellerMonat()
    assert.equal(z.von.slice(0, 7), z.bis.slice(0, 7))
  })

  test('von liegt vor bis', () => {
    const z = standardZeitraumAktuellerMonat()
    assert.ok(z.von < z.bis)
  })

  test('umfasst den heutigen Tag', () => {
    const z = standardZeitraumAktuellerMonat()
    const heute = new Date()
    const heuteIso = `${heute.getFullYear()}-${String(heute.getMonth() + 1).padStart(2, '0')}-${String(heute.getDate()).padStart(2, '0')}`
    assert.ok(z.von <= heuteIso && heuteIso <= z.bis, `${heuteIso} liegt nicht in ${z.von}…${z.bis}`)
  })

  test('endet am letzten Tag des Monats', () => {
    const z = standardZeitraumAktuellerMonat()
    const [jahr, monat] = z.bis.split('-').map(Number)
    const letzterTag = new Date(jahr, monat, 0).getDate()
    assert.equal(Number(z.bis.slice(8)), letzterTag)
  })

  test('ist zwischen zwei Aufrufen stabil', () => {
    assert.deepEqual(standardZeitraumAktuellerMonat(), standardZeitraumAktuellerMonat())
  })

  test('liefert bei jedem Aufruf ein neues Objekt', () => {
    assert.notEqual(standardZeitraumAktuellerMonat(), standardZeitraumAktuellerMonat())
  })
})
