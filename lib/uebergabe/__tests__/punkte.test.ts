// ═══════════════════════════════════════════════════════════════
// Tests: Übergabepunkte — Handlungsbedarf-Logik + Validierung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechneHandlungsbedarf,
  createPunkt,
  validateNachtrag,
  validatePunktEingabe,
  type CreatePunktParams,
} from '../punkte'
import { UserFacingError } from '../../api/user-facing-error'
import { offeneKenntnisnahmen } from '../kenntnisnahmen'
import type { Dringlichkeit, PunktKategorie } from '../types'

function basis(overrides: Partial<CreatePunktParams> = {}): CreatePunktParams {
  return {
    protokollId: 'prot-1',
    organizationId: 'org-1',
    inhalt: 'Frau Muster hat heute Nacht schlecht geschlafen.',
    erstelltVon: 'user-1',
    erstelltVonName: 'Alltagsengel',
    ...overrides,
  }
}

test('Sturz, Medikation und Arztkontakt erzwingen Handlungsbedarf', () => {
  const kategorien: PunktKategorie[] = ['sturz', 'medikation', 'arztkontakt']
  for (const kategorie of kategorien) {
    assert.equal(
      berechneHandlungsbedarf(kategorie, 'normal', false), true,
      `${kategorie} muss Handlungsbedarf auslösen`,
    )
  }
})

test('Kritische Dringlichkeit erzwingt Handlungsbedarf unabhängig von der Kategorie', () => {
  assert.equal(berechneHandlungsbedarf('sonstiges', 'kritisch', false), true)
  assert.equal(berechneHandlungsbedarf('termin', 'kritisch', undefined), true)
})

test('Sonst entscheidet das Formular über den Handlungsbedarf', () => {
  const dringlichkeiten: Dringlichkeit[] = ['normal', 'hoch']
  for (const d of dringlichkeiten) {
    assert.equal(berechneHandlungsbedarf('organisation', d, true), true)
    assert.equal(berechneHandlungsbedarf('organisation', d, false), false)
    assert.equal(berechneHandlungsbedarf('organisation', d, undefined), false)
  }
})

test('validatePunktEingabe verlangt Inhalt und erfassende Person', () => {
  assert.throws(() => validatePunktEingabe(basis({ inhalt: '   ' })), /Inhalt/)
  assert.throws(() => validatePunktEingabe(basis({ erstelltVonName: '' })), /erfassenden Person/)
})

test('validatePunktEingabe blockt unbekannte Kategorien und Dringlichkeiten', () => {
  assert.throws(
    () => validatePunktEingabe(basis({ kategorie: 'irgendwas' as PunktKategorie })),
    /Ungültiger Wert/,
  )
  assert.throws(
    () => validatePunktEingabe(basis({ dringlichkeit: 'sehr_dringend' as Dringlichkeit })),
    /Ungültiger Wert/,
  )
})

test('validatePunktEingabe verlangt zu einer Quell-ID auch den Quelltyp', () => {
  assert.throws(() => validatePunktEingabe(basis({ quelleId: 'abc' })), /Quelltyp/)
  assert.doesNotThrow(() => validatePunktEingabe(basis({ quelleId: 'abc', quelleTyp: 'pflege_verlauf' })))
})

test('offeneKenntnisnahmen meldet die noch fehlenden Empfänger', () => {
  const vorgesehen = ['cg-1', 'cg-2', 'cg-3']
  const quittiert = [{ caregiver_id: 'cg-2' }, { caregiver_id: null }]
  assert.deepEqual(offeneKenntnisnahmen(vorgesehen, quittiert), ['cg-1', 'cg-3'])
  assert.deepEqual(offeneKenntnisnahmen([], quittiert), [])
  assert.deepEqual(offeneKenntnisnahmen(vorgesehen, []), vorgesehen)
})

// ═══════════════════════════════════════════════════════════════
// Nachtrag-Logik + UserFacingError-Kontrakt (Härtung 27.08.2026)
// ═══════════════════════════════════════════════════════════════

test('validateNachtrag blockt einen Nachtrag am OFFENEN Protokoll', () => {
  assert.throws(
    () => validateNachtrag('offen', true),
    (err: unknown) => err instanceof UserFacingError
      && (err as UserFacingError).status === 409
      && /Nachtrag ist nur zu einem abgeschlossenen Protokoll/.test((err as Error).message),
  )
})

test('validateNachtrag blockt einen regulären Punkt am ABGESCHLOSSENEN Protokoll', () => {
  assert.throws(
    () => validateNachtrag('abgeschlossen', false),
    (err: unknown) => err instanceof UserFacingError
      && /nur noch als Nachtrag/.test((err as Error).message),
  )
})

test('validateNachtrag lässt die beiden stimmigen Kombinationen zu', () => {
  assert.doesNotThrow(() => validateNachtrag('offen', false))
  assert.doesNotThrow(() => validateNachtrag('abgeschlossen', true))
})

/** Minimal-Doppelgänger: liefert einen Protokollstatus und merkt sich den Insert. */
function fakePunktClient(protokoll: { status: string } | null) {
  const inserts: Array<Record<string, unknown>> = []
  const selects: Array<{ tabelle: string; filters: Array<[string, unknown]> }> = []
  const supabase = {
    from(tabelle: string) {
      const filters: Array<[string, unknown]> = []
      const kette: Record<string, unknown> = {}
      Object.assign(kette, {
        select: () => kette,
        eq: (spalte: string, wert: unknown) => { filters.push([spalte, wert]); return kette },
        maybeSingle: async () => {
          selects.push({ tabelle, filters })
          return { data: protokoll, error: null }
        },
        insert: (payload: Record<string, unknown>) => {
          inserts.push(payload)
          return { select: () => ({ single: async () => ({ data: { id: 'p-1', ...payload }, error: null }) }) }
        },
      })
      return kette
    },
  }
  return { supabase: supabase as never, inserts, selects }
}

test('createPunkt lehnt nachtrag=true ab, solange das Protokoll offen ist', async () => {
  const { supabase, inserts } = fakePunktClient({ status: 'offen' })
  await assert.rejects(
    () => createPunkt(supabase, basis({ nachtrag: true })),
    (err: unknown) => err instanceof UserFacingError,
  )
  assert.equal(inserts.length, 0, 'Ein semantisch falscher Nachtrag darf nicht gespeichert werden')
})

test('createPunkt speichert den regulären Punkt am offenen Protokoll', async () => {
  const { supabase, inserts, selects } = fakePunktClient({ status: 'offen' })
  await createPunkt(supabase, basis())

  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].nachtrag, false)
  // Der Statuscheck läuft mandantengefiltert, wenn die Org bekannt ist.
  assert.deepEqual(selects[0].filters, [['id', 'prot-1'], ['organization_id', 'org-1']])
})

test('createPunkt speichert den Nachtrag am abgeschlossenen Protokoll', async () => {
  const { supabase, inserts } = fakePunktClient({ status: 'abgeschlossen' })
  await createPunkt(supabase, basis({ nachtrag: true }))
  assert.equal(inserts[0].nachtrag, true)
})

test('createPunkt meldet ein unbekanntes Protokoll als 404', async () => {
  const { supabase } = fakePunktClient(null)
  await assert.rejects(
    () => createPunkt(supabase, basis()),
    (err: unknown) => err instanceof UserFacingError && (err as UserFacingError).status === 404,
  )
})

test('Validierungsfehler in punkte.ts sind UserFacingError, nicht nackte Error', () => {
  const faelle: Array<() => void> = [
    () => validatePunktEingabe(basis({ inhalt: '  ' })),
    () => validatePunktEingabe(basis({ erstelltVonName: '' })),
    () => validatePunktEingabe(basis({ quelleId: 'abc' })),
    () => validatePunktEingabe(basis({ kategorie: 'irgendwas' as PunktKategorie })),
  ]
  for (const fall of faelle) {
    assert.throws(fall, (err: unknown) => err instanceof UserFacingError)
  }
})
