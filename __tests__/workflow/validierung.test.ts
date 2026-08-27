/**
 * Eingabepruefung der Workflow-Engine (lib/workflow/validierung.ts)
 *
 * Die Ops-Routen bauen ihre Filter direkt aus der Query-String:
 * `Number(url.searchParams.get('limit'))` und, beim Status, ein blosser
 * TypeScript-Cast `as WfQueueStatus`. Beides prueft zur Laufzeit nichts.
 * Ein `?limit=abc` wird damit zu NaN, ein `?status=beliebig` zu einem
 * Filter auf einen Wert, den die Spalte nicht kennt — die Antwort ist
 * dann eine leere Liste, die wie „keine Eintraege" aussieht.
 *
 * Diese Datei prueft die Schranken einzeln; die Listen-Funktionen selbst
 * werden in warteschlange.test.ts und dead-letter.test.ts gegen sie
 * getestet.
 */

import { describe, it, expect } from 'vitest'
import {
  MAX_LIMIT,
  pruefeEnum,
  pruefeLimit,
  pruefeOffset,
  pruefeQueueStatus,
  queueSperrgrund,
  WIEDERHOLBARE_QUEUE_STATUS,
  ABBRECHBARE_QUEUE_STATUS,
} from '@/lib/workflow/validierung'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { WF_QUEUE_STATUS_WERTE } from '@/lib/workflow/types'

describe('pruefeLimit', () => {
  it('laesst undefined durch — der Aufrufer entscheidet', () => {
    expect(pruefeLimit(undefined)).toBeUndefined()
  })

  it('laesst ein normales Limit unveraendert', () => {
    expect(pruefeLimit(25)).toBe(25)
  })

  it('deckelt auf die Obergrenze', () => {
    expect(pruefeLimit(1_000_000)).toBe(MAX_LIMIT)
    expect(pruefeLimit(MAX_LIMIT + 1)).toBe(MAX_LIMIT)
  })

  it('laesst genau die Obergrenze zu', () => {
    expect(pruefeLimit(MAX_LIMIT)).toBe(MAX_LIMIT)
  })

  /** `?limit=abc` erreicht die Funktion als NaN. */
  it('weist NaN ab', () => {
    expect(() => pruefeLimit(Number('abc'))).toThrow(UserFacingError)
  })

  it('weist Unendlich ab', () => {
    expect(() => pruefeLimit(Infinity)).toThrow(UserFacingError)
  })

  it('weist 0 und negative Werte ab', () => {
    expect(() => pruefeLimit(0)).toThrow(/mindestens 1/)
    expect(() => pruefeLimit(-10)).toThrow(/mindestens 1/)
  })

  it('schneidet Nachkommastellen ab', () => {
    expect(pruefeLimit(10.9)).toBe(10)
  })
})

describe('pruefeOffset', () => {
  it('laesst undefined und 0 durch', () => {
    expect(pruefeOffset(undefined)).toBeUndefined()
    expect(pruefeOffset(0)).toBe(0)
  })

  /**
   * Ein negatives Offset kehrt den `range()`-Aufruf um und liefert
   * PostgREST einen Bereich, den es nicht bedienen kann.
   */
  it('weist negative Werte ab', () => {
    expect(() => pruefeOffset(-1)).toThrow(/nicht negativ/)
  })

  it('weist NaN ab', () => {
    expect(() => pruefeOffset(Number('x'))).toThrow(UserFacingError)
  })
})

describe('pruefeEnum', () => {
  const ERLAUBT = ['a', 'b'] as const

  it('laesst leere Eingaben als undefined durch', () => {
    expect(pruefeEnum(undefined, ERLAUBT, 'feld')).toBeUndefined()
    expect(pruefeEnum(null, ERLAUBT, 'feld')).toBeUndefined()
    expect(pruefeEnum('', ERLAUBT, 'feld')).toBeUndefined()
  })

  it('laesst erlaubte Werte durch', () => {
    expect(pruefeEnum('a', ERLAUBT, 'feld')).toBe('a')
  })

  /** Der Feldname gehoert in die Meldung — sonst raet der Aufrufer. */
  it('nennt Feld und erlaubte Werte im Fehler', () => {
    expect(() => pruefeEnum('c', ERLAUBT, 'status')).toThrow(/"status"/)
    expect(() => pruefeEnum('c', ERLAUBT, 'status')).toThrow(/a, b/)
  })

  it('meldet als UserFacingError mit Status 400', () => {
    try {
      pruefeEnum('c', ERLAUBT, 'status')
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect(e).toBeInstanceOf(UserFacingError)
      expect((e as UserFacingError).status).toBe(400)
    }
  })
})

describe('pruefeQueueStatus', () => {
  it('akzeptiert jeden Wert des DB-CHECK-Constraints', () => {
    for (const wert of WF_QUEUE_STATUS_WERTE) {
      expect(pruefeQueueStatus(wert)).toBe(wert)
    }
  })

  it('weist einen erfundenen Status ab', () => {
    expect(() => pruefeQueueStatus('geloescht')).toThrow(UserFacingError)
  })
})

describe('Zustandslisten', () => {
  /**
   * Beide Listen duerfen nur Werte enthalten, die der CHECK-Constraint
   * von `wf_warteschlange` kennt (Migration 20260813010000). Ein Wert
   * daneben wuerde im UPDATE-Filter stillschweigend nie treffen.
   */
  it('enthalten ausschliesslich gueltige Statuswerte', () => {
    for (const s of [...WIEDERHOLBARE_QUEUE_STATUS, ...ABBRECHBARE_QUEUE_STATUS]) {
      expect(WF_QUEUE_STATUS_WERTE).toContain(s)
    }
  })

  it('sind nicht leer — sonst waere jede Aktion gesperrt', () => {
    expect(WIEDERHOLBARE_QUEUE_STATUS.length).toBeGreaterThan(0)
    expect(ABBRECHBARE_QUEUE_STATUS.length).toBeGreaterThan(0)
  })
})

describe('queueSperrgrund', () => {
  it('begruendet die Sperre bei erledigten Eintraegen mit der Doppelausfuehrung', () => {
    expect(queueSperrgrund('erledigt', 'wiederholen')).toMatch(/zweites Mal/)
  })

  it('unterscheidet Wiederholen und Abbrechen', () => {
    expect(queueSperrgrund('erledigt', 'wiederholen'))
      .not.toBe(queueSperrgrund('erledigt', 'abbrechen'))
  })

  it('verweist bei laufenden Eintraegen auf den offenen Versuch', () => {
    expect(queueSperrgrund('in_bearbeitung', 'wiederholen')).toMatch(/gerade verarbeitet/)
    expect(queueSperrgrund('in_bearbeitung', 'abbrechen')).toMatch(/gerade verarbeitet/)
  })

  /**
   * Die Meldung geht an den Client. Sie darf den Zustand benennen, aber
   * keine Datenbank- oder Infrastrukturdetails enthalten.
   */
  it('liefert fuer jeden Statuswert eine nichtleere Begruendung', () => {
    for (const s of WF_QUEUE_STATUS_WERTE) {
      expect(queueSperrgrund(s, 'wiederholen').length).toBeGreaterThan(10)
      expect(queueSperrgrund(s, 'abbrechen').length).toBeGreaterThan(10)
    }
  })
})
