/**
 * one() — eingebettete PostgREST-Relationen normalisieren
 *
 * Klein, aber an 11 Stellen im Einsatz. PostgREST liefert bei einem
 * FK-Join zur Laufzeit EIN Objekt, der generierte Typ beschreibt je nach
 * Query-Form ein Array. Wer sich auf die falsche Form verlässt, bekommt
 * entweder `undefined.first_name` zur Laufzeit oder schreibt `as any` —
 * und dann fällt es gar nicht mehr auf.
 *
 * Die Fälle unten sind genau die, die im Bestand vorkommen: Objekt,
 * einelementiges Array, leeres Array (kein Treffer), null (LEFT JOIN
 * ohne Gegenstück).
 */

import { describe, it, expect } from 'vitest'
import { one } from '@/lib/supabase/join'

describe('one()', () => {
  it('reicht ein einzelnes Objekt durch', () => {
    const zeile = { first_name: 'Erika', last_name: 'Müller' }
    expect(one(zeile)).toEqual(zeile)
  })

  it('nimmt das erste Element eines Arrays', () => {
    expect(one([{ id: 'a' }, { id: 'b' }])).toEqual({ id: 'a' })
  })

  it('macht aus einem LEEREN Array null — nicht undefined', () => {
    // Der Unterschied zählt: `undefined` würde in `?? standard`
    // hineinfallen, in einem `=== null`-Vergleich aber nicht.
    expect(one([])).toBeNull()
  })

  it('macht aus null und undefined null', () => {
    // LEFT JOIN ohne Gegenstück liefert null; ein fehlendes Feld undefined.
    expect(one(null)).toBeNull()
    expect(one(undefined)).toBeNull()
  })

  it('behält falsy Nutzwerte, statt sie zu null zu machen', () => {
    // Ein Join auf eine Zahl-/Textspalte kann 0 oder '' liefern. Würde
    // das zu null, verschwände ein echter Wert.
    expect(one(0)).toBe(0)
    expect(one('')).toBe('')
    expect(one(false)).toBe(false)
  })

  it('behält ein verschachteltes Array als Wert', () => {
    // Nur die ÄUSSERE Ebene wird ausgepackt.
    expect(one([[1, 2]])).toEqual([1, 2])
  })

  it('verändert die Eingabe nicht', () => {
    const eingabe = [{ id: 'a' }]
    one(eingabe)
    expect(eingabe).toEqual([{ id: 'a' }])
  })
})
