// ═══════════════════════════════════════════════════════════════
// Tests: Monatsabschluss der Pflegedokumentation (pflege_doku_perioden)
//
// Der Abschluss sperrt pflege_verlauf für einen Monat — das ist der
// rechtlich relevante Teil (abgeschlossene Pflegedoku darf nicht mehr
// verändert werden). Zwei Fehlerklassen wären hier besonders teuer und
// blieben bisher ungetestet:
//   1. Ein fehlender/falscher organization_id-Fence auf einer der drei
//      Abfragen (Periode lesen, Verlauf sperren, Periode abschließen)
//      würde Mandantengrenzen verletzen.
//   2. Ein falsches Monatsfenster (insb. Dezember→Januar-Übergang) würde
//      zu viele oder zu wenige Einträge sperren.
//
// Läuft mit: npm run test:unit (node:test).
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  abschliessenPeriode,
  monatsGrenzen,
  validateJahrMonat,
  wiedereroeffnenPeriode,
} from '../doku-perioden'
import { erstelleFakeSupabase, hatFilter, hatOrgFence, type FakeAufruf } from '@/__tests__/helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const PERIODE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const CLIENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ACTOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

// ---------------------------------------------------------------------------
// Reine Funktionen
// ---------------------------------------------------------------------------

test('validateJahrMonat lehnt Jahr außerhalb 2020-2099 ab', () => {
  assert.throws(() => validateJahrMonat(2019, 6), /Jahr muss zwischen 2020 und 2099/)
  assert.throws(() => validateJahrMonat(2100, 6), /Jahr muss zwischen 2020 und 2099/)
})

test('validateJahrMonat lehnt Monat außerhalb 1-12 ab', () => {
  assert.throws(() => validateJahrMonat(2026, 0), /Monat muss zwischen 1 und 12/)
  assert.throws(() => validateJahrMonat(2026, 13), /Monat muss zwischen 1 und 12/)
})

test('monatsGrenzen berechnet [von, bis) innerhalb eines Jahres', () => {
  const { von, bis } = monatsGrenzen(2026, 8)
  assert.equal(von, '2026-08-01T00:00:00.000Z')
  assert.equal(bis, '2026-09-01T00:00:00.000Z')
})

test('monatsGrenzen behandelt den Jahreswechsel Dezember → Januar', () => {
  const { von, bis } = monatsGrenzen(2026, 12)
  assert.equal(von, '2026-12-01T00:00:00.000Z')
  assert.equal(bis, '2027-01-01T00:00:00.000Z')
})

// ---------------------------------------------------------------------------
// abschliessenPeriode
// ---------------------------------------------------------------------------

function offenePeriode(ueberschreibung: Record<string, unknown> = {}) {
  return {
    id: PERIODE, organization_id: ORG, client_id: CLIENT,
    jahr: 2026, monat: 8, status: 'offen',
    ...ueberschreibung,
  }
}

test('abschliessenPeriode sperrt den Verlauf, fenct alle drei Tabellenzugriffe auf organization_id und liefert die Sperrzahl', async () => {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'pflege_doku_perioden' && a.operation === 'select') return { data: offenePeriode() }
    if (a.tabelle === 'pflege_verlauf' && a.operation === 'update') return { data: [{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }] }
    if (a.tabelle === 'pflege_doku_perioden' && a.operation === 'update') {
      return { data: { ...offenePeriode(), status: 'abgeschlossen', abgeschlossen_von: ACTOR } }
    }
    return { data: null }
  })

  const result = await abschliessenPeriode(f.client, PERIODE, ORG, { actorId: ACTOR, freigabeBemerkung: 'ok' })

  assert.equal(result.periode.status, 'abgeschlossen')
  assert.equal(result.gesperrteEintraege, 3)

  const lesen = f.ersterAuf('pflege_doku_perioden', 'select')
  const sperren = f.ersterAuf('pflege_verlauf', 'update')
  const abschluss = f.ersterAuf('pflege_doku_perioden', 'update')
  assert.ok(hatOrgFence(lesen, ORG), 'Periode-Lesen muss org-gefenct sein')
  assert.ok(hatOrgFence(sperren, ORG), 'Verlauf-Sperre muss org-gefenct sein')
  assert.ok(hatOrgFence(abschluss, ORG), 'Periode-Abschluss muss org-gefenct sein')

  // Fenster + Zustands-Guard der Sperre: nur bisher entsperrte Einträge des
  // richtigen Kunden und Monats werden angefasst.
  assert.ok(hatFilter(sperren, 'eq', 'client_id', CLIENT))
  assert.ok(hatFilter(sperren, 'eq', 'gesperrt', false))
  assert.ok(hatFilter(sperren, 'gte', 'eintrag_datum', '2026-08-01T00:00:00.000Z'))
  assert.ok(hatFilter(sperren, 'lt', 'eintrag_datum', '2026-09-01T00:00:00.000Z'))
  assert.equal((sperren!.payload as Record<string, unknown>).gesperrt, true)
  assert.equal((sperren!.payload as Record<string, unknown>).gesperrt_von, ACTOR)
})

test('abschliessenPeriode lehnt eine bereits abgeschlossene Periode ab, ohne den Verlauf anzufassen', async () => {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'pflege_doku_perioden' && a.operation === 'select') {
      return { data: offenePeriode({ status: 'abgeschlossen' }) }
    }
    return { data: null }
  })

  await assert.rejects(
    () => abschliessenPeriode(f.client, PERIODE, ORG, { actorId: ACTOR }),
    /Periode ist bereits abgeschlossen/
  )
  assert.equal(f.auf('pflege_verlauf').length, 0, 'Verlauf darf bei abgelehntem Abschluss nicht angefasst werden')
})

test('abschliessenPeriode lehnt eine unbekannte Periode ab', async () => {
  const f = erstelleFakeSupabase(() => ({ data: null }))
  await assert.rejects(
    () => abschliessenPeriode(f.client, PERIODE, ORG, { actorId: ACTOR }),
    /Periode nicht gefunden/
  )
})

// ---------------------------------------------------------------------------
// wiedereroeffnenPeriode
// ---------------------------------------------------------------------------

test('wiedereroeffnenPeriode verlangt einen Grund, bevor überhaupt die Datenbank angefasst wird', async () => {
  const f = erstelleFakeSupabase(() => ({ data: null }))
  await assert.rejects(
    () => wiedereroeffnenPeriode(f.client, PERIODE, ORG, { actorId: ACTOR, grund: '   ' }),
    /Ein Grund für die Wiedereröffnung ist erforderlich/
  )
  assert.equal(f.aufrufe.length, 0)
})

test('wiedereroeffnenPeriode lehnt Perioden ab, die nicht abgeschlossen sind', async () => {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'pflege_doku_perioden' && a.operation === 'select') {
      return { data: offenePeriode({ status: 'offen' }) }
    }
    return { data: null }
  })
  await assert.rejects(
    () => wiedereroeffnenPeriode(f.client, PERIODE, ORG, { actorId: ACTOR, grund: 'Nachtrag' }),
    /Nur abgeschlossene Perioden können wiedereröffnet werden/
  )
})

test('wiedereroeffnenPeriode entsperrt den Verlauf des Monats und protokolliert den (getrimmten) Grund', async () => {
  const f = erstelleFakeSupabase((a: FakeAufruf) => {
    if (a.tabelle === 'pflege_doku_perioden' && a.operation === 'select') {
      return { data: offenePeriode({ status: 'abgeschlossen' }) }
    }
    if (a.tabelle === 'pflege_verlauf' && a.operation === 'update') return { data: [{ id: 'e-1' }] }
    if (a.tabelle === 'pflege_doku_perioden' && a.operation === 'update') {
      return { data: { ...offenePeriode(), status: 'wiedereroeffnet' } }
    }
    return { data: null }
  })

  const result = await wiedereroeffnenPeriode(f.client, PERIODE, ORG, { actorId: ACTOR, grund: '  Nachtrag erforderlich  ' })

  assert.equal(result.entsperrteEintraege, 1)
  const sperren = f.ersterAuf('pflege_verlauf', 'update')
  assert.equal((sperren!.payload as Record<string, unknown>).gesperrt, false)
  assert.ok(hatFilter(sperren, 'eq', 'gesperrt', true), 'nur bisher gesperrte Einträge werden entsperrt')

  const abschluss = f.ersterAuf('pflege_doku_perioden', 'update')
  assert.equal((abschluss!.payload as Record<string, unknown>).wiedereroeffnung_grund, 'Nachtrag erforderlich')
})
