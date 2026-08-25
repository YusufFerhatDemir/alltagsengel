// ═══════════════════════════════════════════════════════════════
// Welle 6 — Angehörigen-Portal, Freigabeprüfung
// (lib/angehoerige/portal-helpers.ts)
// ═══════════════════════════════════════════════════════════════
//
// hatPortalBereichZugriff() und erlaubteClientIds() entscheiden, welche
// Daten ein Angehöriger sehen darf. Beide sind rein — sie bekommen die
// bereits geladenen Zugänge übergeben. Der Supabase-Teil des Moduls
// (pruefePortalZugang) bleibt außen vor.
//
// Besonderheit, die hier festgehalten wird: Pflegeberichte brauchen
// ZWEI Freigaben — den Bereich in freigegebene_bereiche UND das
// gesonderte Kennzeichen pflegeberichte_freigegeben.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { hatPortalBereichZugriff, erlaubteClientIds } from '../angehoerige/portal-helpers'
import { FREIGABE_BEREICHE, type AngehoerigenZugang, type FreigabeBereich } from '../angehoerige/types'

/** Zugangs-Doppelgänger — nur die Felder, die die beiden Funktionen lesen. */
function zugang(
  clientId: string,
  bereiche: FreigabeBereich[],
  pflegeberichteFreigegeben = false,
): AngehoerigenZugang {
  return {
    id: `zugang-${clientId}`,
    organization_id: 'org-test',
    user_id: 'user-test',
    client_id: clientId,
    rolle: 'angehoeriger' as AngehoerigenZugang['rolle'],
    status: 'aktiv' as AngehoerigenZugang['status'],
    freigegebene_bereiche: bereiche,
    pflegeberichte_freigegeben: pflegeberichteFreigegeben,
    erteilt_von: null,
    erteilt_am: '2026-01-01T00:00:00Z',
    widerrufen_von: null,
    widerrufen_am: null,
    widerruf_grund: null,
    gueltig_bis: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

// ───────────────────────────────────────────────────────────────
describe('hatPortalBereichZugriff', () => {
  test('ohne Zugänge gibt es keinen Zugriff', () => {
    for (const b of FREIGABE_BEREICHE) {
      assert.equal(hatPortalBereichZugriff([], b), false, `${b} ohne Zugang erlaubt`)
    }
  })

  test('ein freigegebener Bereich ist zugänglich', () => {
    const z = [zugang('k1', ['termine', 'dokumente'])]
    assert.equal(hatPortalBereichZugriff(z, 'termine'), true)
    assert.equal(hatPortalBereichZugriff(z, 'dokumente'), true)
  })

  test('ein nicht freigegebener Bereich bleibt gesperrt', () => {
    const z = [zugang('k1', ['termine'])]
    assert.equal(hatPortalBereichZugriff(z, 'leistungen'), false)
    assert.equal(hatPortalBereichZugriff(z, 'nachrichten'), false)
  })

  test('mehrere Zugänge: einer genügt', () => {
    const z = [zugang('k1', ['termine']), zugang('k2', ['dokumente'])]
    assert.equal(hatPortalBereichZugriff(z, 'dokumente'), true)
  })

  test('mit clientId zählt nur der Zugang zu genau diesem Klienten', () => {
    const z = [zugang('k1', ['termine']), zugang('k2', ['dokumente'])]
    assert.equal(hatPortalBereichZugriff(z, 'dokumente', 'k2'), true)
    assert.equal(hatPortalBereichZugriff(z, 'dokumente', 'k1'), false)
  })

  test('unbekannte clientId ergibt keinen Zugriff', () => {
    const z = [zugang('k1', ['termine'])]
    assert.equal(hatPortalBereichZugriff(z, 'termine', 'k99'), false)
  })

  test('Pflegeberichte brauchen die Bereichsfreigabe UND das gesonderte Kennzeichen', () => {
    const nurBereich = [zugang('k1', ['pflegeberichte'], false)]
    const nurKennzeichen = [zugang('k1', ['termine'], true)]
    const beides = [zugang('k1', ['pflegeberichte'], true)]

    assert.equal(hatPortalBereichZugriff(nurBereich, 'pflegeberichte'), false, 'Kennzeichen fehlt')
    assert.equal(hatPortalBereichZugriff(nurKennzeichen, 'pflegeberichte'), false, 'Bereich fehlt')
    assert.equal(hatPortalBereichZugriff(beides, 'pflegeberichte'), true)
  })

  test('das Pflegeberichte-Kennzeichen öffnet keinen anderen Bereich', () => {
    const z = [zugang('k1', ['termine'], true)]
    assert.equal(hatPortalBereichZugriff(z, 'dokumente'), false)
  })

  test('leere Bereichsliste sperrt alles', () => {
    const z = [zugang('k1', [], true)]
    for (const b of FREIGABE_BEREICHE) {
      assert.equal(hatPortalBereichZugriff(z, b), false, `${b} war trotzdem offen`)
    }
  })

  test('jeder Bereich lässt sich einzeln freigeben', () => {
    for (const b of FREIGABE_BEREICHE) {
      const z = [zugang('k1', [b], true)]
      assert.equal(hatPortalBereichZugriff(z, b), true, `${b} ließ sich nicht freigeben`)
      for (const anderer of FREIGABE_BEREICHE) {
        if (anderer === b) continue
        assert.equal(hatPortalBereichZugriff(z, anderer), false, `${b} öffnete auch ${anderer}`)
      }
    }
  })
})

// ───────────────────────────────────────────────────────────────
describe('erlaubteClientIds', () => {
  test('ohne Zugänge ist die Liste leer', () => {
    assert.deepEqual(erlaubteClientIds([], 'termine'), [])
  })

  test('liefert die Klienten, deren Zugang den Bereich freigibt', () => {
    const z = [zugang('k1', ['termine']), zugang('k2', ['dokumente']), zugang('k3', ['termine'])]
    assert.deepEqual(erlaubteClientIds(z, 'termine'), ['k1', 'k3'])
  })

  test('nicht freigegebener Bereich ergibt eine leere Liste', () => {
    const z = [zugang('k1', ['termine'])]
    assert.deepEqual(erlaubteClientIds(z, 'nachrichten'), [])
  })

  test('Pflegeberichte verlangen auch hier beide Freigaben', () => {
    const z = [
      zugang('k1', ['pflegeberichte'], true),
      zugang('k2', ['pflegeberichte'], false),
      zugang('k3', ['termine'], true),
    ]
    assert.deepEqual(erlaubteClientIds(z, 'pflegeberichte'), ['k1'])
  })

  test('behält die Reihenfolge der Zugänge bei', () => {
    const z = [zugang('kZ', ['termine']), zugang('kA', ['termine'])]
    assert.deepEqual(erlaubteClientIds(z, 'termine'), ['kZ', 'kA'])
  })

  test('mehrere Zugänge zum selben Klienten erscheinen mehrfach', () => {
    // Dokumentiert das tatsächliche Verhalten: die Funktion entdoppelt nicht.
    const z = [zugang('k1', ['termine']), zugang('k1', ['termine'])]
    assert.deepEqual(erlaubteClientIds(z, 'termine'), ['k1', 'k1'])
  })

  test('deckt sich mit hatPortalBereichZugriff je Klient', () => {
    const z = [
      zugang('k1', ['termine', 'pflegeberichte'], true),
      zugang('k2', ['leistungen'], false),
      zugang('k3', ['pflegeberichte'], false),
    ]
    for (const bereich of FREIGABE_BEREICHE) {
      const liste = erlaubteClientIds(z, bereich)
      for (const eintrag of z) {
        assert.equal(
          liste.includes(eintrag.client_id),
          hatPortalBereichZugriff(z, bereich, eintrag.client_id),
          `${bereich}/${eintrag.client_id}: die beiden Funktionen widersprechen sich`,
        )
      }
    }
  })
})
