// ═══════════════════════════════════════════════════════════════════════
// Akten — welcher Dokumentstatus noch ausgeliefert wird (Befund 28.08.2026)
// ═══════════════════════════════════════════════════════════════════════
//
// GET /api/akten/dokumente/[id]/download prüfte allein auf 'archiviert'.
// Der live gelesene CHECK auf akten_dokumente.status kennt fünf Werte:
// entwurf | aktiv | archiviert | gesperrt | abgelaufen. Ein Dokument, das
// ausdrücklich auf 'gesperrt' gesetzt wurde, bekam damit weiterhin eine
// signierte URL — die Statusauswahl der Akte war an dieser Stelle reine
// Anzeige.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  darfAusgeliefertWerden,
  ausliefernAbgelehntGrund,
  DOKUMENT_STATUS_WERTE,
  DOKUMENT_STATUS_OHNE_AUSLIEFERUNG,
} from '@/lib/akten/types'

describe('Auslieferung von Aktendokumenten', () => {
  it('liefert ein GESPERRTES Dokument nicht aus', () => {
    // Am alten Stand: true — der Download lief durch.
    expect(darfAusgeliefertWerden('gesperrt')).toBe(false)
  })

  it('liefert ein archiviertes Dokument weiterhin nicht aus', () => {
    expect(darfAusgeliefertWerden('archiviert')).toBe(false)
  })

  it.each(['aktiv', 'entwurf', 'abgelaufen'])('liefert „%s" weiterhin aus', s => {
    expect(darfAusgeliefertWerden(s)).toBe(true)
  })

  it('lässt eine abgelaufene Genehmigung ausdrücklich einsehbar', () => {
    // Sie ist nicht mehr gültig, aber lesbar — darauf beruht die
    // Ablaufwarnung, die zum Nachfordern auffordert.
    expect(darfAusgeliefertWerden('abgelaufen')).toBe(true)
  })

  it('lässt Altbestand ohne Status lesbar', () => {
    for (const w of [null, undefined, '', '   ']) {
      expect(darfAusgeliefertWerden(w as any)).toBe(true)
    }
  })

  it('weist einen unbekannten Status ab (fail-closed)', () => {
    for (const w of ['GESPERRT', 'geloescht', 'quarantaene', 'aktiv;']) {
      expect(darfAusgeliefertWerden(w), `„${w}" durfte nicht durchgehen`).toBe(false)
    }
  })

  it('sperrt auch mit umgebenden Leerzeichen', () => {
    // Getrimmt wird absichtlich: ' gesperrt ' ist derselbe Zustand und darf
    // die Sperre nicht umgehen.
    expect(darfAusgeliefertWerden(' gesperrt ')).toBe(false)
    expect(darfAusgeliefertWerden(' aktiv ')).toBe(true)
  })

  it('nennt in der Meldung den tatsächlichen Grund', () => {
    expect(ausliefernAbgelehntGrund('gesperrt')).toMatch(/gesperrt/)
    expect(ausliefernAbgelehntGrund('archiviert')).toMatch(/archiviert/)
    expect(ausliefernAbgelehntGrund('quatsch')).toMatch(/unbekannten Status/)
  })

  it('führt nur Werte, die der Status-CHECK auch kennt', () => {
    for (const s of DOKUMENT_STATUS_OHNE_AUSLIEFERUNG) {
      expect(DOKUMENT_STATUS_WERTE, `${s} ist kein gültiger Status`).toContain(s)
    }
  })

  it('deckt jeden CHECK-Wert ab — kein Status bleibt unentschieden', () => {
    for (const s of DOKUMENT_STATUS_WERTE) {
      expect(typeof darfAusgeliefertWerden(s)).toBe('boolean')
    }
  })
})
