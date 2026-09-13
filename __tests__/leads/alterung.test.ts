/**
 * Alterung von Leads und Kunden.
 * @see lib/leads/alterung.ts
 *
 * Der Test, an dem alles hängt, steht unter „Manuelle Stufe":
 * Herunterstufen von Hand darf einen alten Vorgang NICHT unsichtbar machen.
 */
import { describe, it, expect } from 'vitest'
import {
  ALTERUNG_SCHWELLEN_TAGE, ESKALATION_SCHWELLEN_TAGE, PRIORITAETEN, PRIORITAET_META,
  bewerteAlterung, dringlichkeitsRang, eskalationFuerTage, hoeherePrioritaet,
  istPrioritaet, prioritaetFuerTage, tageSeit, tageUeberfaellig, wiedervorlageIn,
  zaehlePrioritaeten, type Alterung,
} from '@/lib/leads/alterung'
import { followUpSeitWiedervorlage } from '@/lib/leads/follow-up'

const JETZT = new Date('2026-09-13T12:00:00.000Z')

/** Ein Zeitpunkt vor n Tagen. */
function vor(tage: number, stunden = 0): string {
  return new Date(JETZT.getTime() - (tage * 24 + stunden) * 3600_000).toISOString()
}

describe('tageSeit', () => {
  it('zählt volle Tage, nicht angefangene', () => {
    expect(tageSeit(vor(3), JETZT)).toBe(3)
    expect(tageSeit(vor(3, -1), JETZT)).toBe(2)   // 2 Tage 23 h
  })
  it('ergibt null statt 0 bei fehlendem Wert', () => {
    expect(tageSeit(null, JETZT)).toBeNull()
    expect(tageSeit(undefined, JETZT)).toBeNull()
    expect(tageSeit('kein Datum', JETZT)).toBeNull()
  })
  it('ein Zeitpunkt in der Zukunft ergibt keine positiven Tage', () => {
    expect(tageSeit(new Date(JETZT.getTime() + 86_400_000), JETZT)).toBeLessThan(0)
  })
})

describe('Schwellen — „über" heißt echt größer', () => {
  it.each([
    [0, 'normal'], [7, 'normal'], [8, 'erhoeht'],
    [14, 'erhoeht'], [15, 'hoch'],
    [30, 'hoch'], [31, 'kritisch'], [365, 'kritisch'],
  ])('%i Tage → %s', (tage, erwartet) => {
    expect(prioritaetFuerTage(tage)).toBe(erwartet)
  })

  it('genau auf der Schwelle noch die mildere Stufe', () => {
    for (const [name, grenze] of Object.entries(ALTERUNG_SCHWELLEN_TAGE)) {
      expect(prioritaetFuerTage(grenze), `Tag ${grenze} (${name})`)
        .not.toBe(prioritaetFuerTage(grenze + 1))
    }
  })

  it('ohne Uhr keine Stufe — nicht „normal als Notnagel", sondern null-Eingabe', () => {
    expect(prioritaetFuerTage(null)).toBe('normal')
  })
})

describe('bewerteAlterung — welche Uhr läuft', () => {
  it('nimmt den letzten Kontakt, wenn es einen gibt', () => {
    const a = bewerteAlterung({ letzterKontakt: vor(20), eingang: vor(100), offen: true }, JETZT)
    expect(a.tageSeitKontakt).toBe(20)
    expect(a.quelle).toBe('letzter_kontakt')
    expect(a.automatisch).toBe('hoch')
  })

  it('fällt auf den Eingang zurück, wenn nie Kontakt bestand', () => {
    const a = bewerteAlterung({ eingang: vor(9), offen: true }, JETZT)
    expect(a.quelle).toBe('eingang')
    expect(a.automatisch).toBe('erhoeht')
  })

  it('nennt die Quelle „keine", statt ein Alter zu behaupten', () => {
    const a = bewerteAlterung({ offen: true }, JETZT)
    expect(a.tageSeitKontakt).toBeNull()
    expect(a.quelle).toBe('keine')
    expect(a.automatisch).toBe('normal')
  })

  it('ein abgeschlossener Vorgang altert nicht', () => {
    const a = bewerteAlterung({ letzterKontakt: vor(400), wiedervorlage: vor(50), offen: false }, JETZT)
    expect(a.tageSeitKontakt).toBeNull()
    expect(a.automatisch).toBe('normal')
    expect(a.eskalation).toBe(0)
  })

  it('behält aber eine von Hand gesetzte Stufe auch im Abschluss', () => {
    const a = bewerteAlterung({ prioritaetManuell: 'hoch', offen: false }, JETZT)
    expect(a.effektiv).toBe('hoch')
  })
})

describe('Manuelle Stufe', () => {
  it('hochstufen von Hand geht jederzeit', () => {
    const a = bewerteAlterung({ letzterKontakt: vor(1), prioritaetManuell: 'kritisch', offen: true }, JETZT)
    expect(a.automatisch).toBe('normal')
    expect(a.effektiv).toBe('kritisch')
    expect(a.manuellUeberstimmt).toBe(false)
  })

  it('herunterstufen macht einen alten Vorgang NICHT unsichtbar', () => {
    // Der Kern von Phase 5. Wer „normal" auf einen 40-Tage-Vorgang setzt,
    // bekommt trotzdem „kritisch" — sichtbar als manuellUeberstimmt.
    const a = bewerteAlterung({ letzterKontakt: vor(40), prioritaetManuell: 'normal', offen: true }, JETZT)
    expect(a.effektiv).toBe('kritisch')
    expect(a.manuellUeberstimmt).toBe(true)
  })

  it('gleiche Stufe gilt nicht als überstimmt', () => {
    const a = bewerteAlterung({ letzterKontakt: vor(20), prioritaetManuell: 'hoch', offen: true }, JETZT)
    expect(a.effektiv).toBe('hoch')
    expect(a.manuellUeberstimmt).toBe(false)
  })

  it('hoeherePrioritaet ist in beiden Richtungen gleich', () => {
    for (const a of PRIORITAETEN) for (const b of PRIORITAETEN) {
      expect(hoeherePrioritaet(a, b)).toBe(hoeherePrioritaet(b, a))
    }
  })

  it('istPrioritaet weist Unbekanntes ab', () => {
    expect(istPrioritaet('hoch')).toBe(true)
    expect(istPrioritaet('sehr_hoch')).toBe(false)
    expect(istPrioritaet(2)).toBe(false)
    expect(istPrioritaet(null)).toBe(false)
  })
})

describe('Eskalation bei überfälliger Wiedervorlage', () => {
  it.each([[0, 0], [1, 1], [2, 1], [3, 2], [6, 2], [7, 3], [40, 3]])(
    '%i Tage überfällig → Stufe %i', (tage, stufe) => {
      expect(eskalationFuerTage(tage)).toBe(stufe)
    })

  it('keine Wiedervorlage heißt keine Eskalation — nicht Stufe 0 aus Verlegenheit', () => {
    expect(tageUeberfaellig(null, JETZT)).toBeNull()
    expect(eskalationFuerTage(null)).toBe(0)
  })

  it('eine künftige Wiedervorlage ist nicht überfällig', () => {
    const morgen = new Date(JETZT.getTime() + 86_400_000).toISOString()
    expect(tageUeberfaellig(morgen, JETZT)).toBeNull()
  })

  it('ein Kalendertag gilt ab Tagesbeginn, nicht ab Mitternacht-plus-24h', () => {
    // Heute 12:00 UTC, Wiedervorlage „heute" → fällig, aber 0 Tage drüber.
    expect(tageUeberfaellig('2026-09-13', JETZT)).toBe(0)
    expect(tageUeberfaellig('2026-09-10', JETZT)).toBe(3)
  })

  it('deckt sich mit der Follow-up-Leiter: überfällig hier heißt auch dort nicht „keine"', () => {
    const faellig = '2026-09-10'
    expect(tageUeberfaellig(faellig, JETZT)).toBeGreaterThan(0)
    expect(followUpSeitWiedervorlage(`${faellig}T00:00:00.000Z`, JETZT)).not.toBe('keine')
  })

  it('Eskalation und Priorität sind unabhängig', () => {
    // Gestern gesprochen, aber eine Wiedervorlage von vor 10 Tagen offen.
    const a = bewerteAlterung({ letzterKontakt: vor(1), wiedervorlage: vor(10), offen: true }, JETZT)
    expect(a.effektiv).toBe('normal')
    expect(a.eskalation).toBe(3)
  })
})

describe('Zählung und Reihenfolge', () => {
  const bewertungen: Alterung[] = [
    bewerteAlterung({ letzterKontakt: vor(1), offen: true }, JETZT),
    bewerteAlterung({ letzterKontakt: vor(10), offen: true }, JETZT),
    bewerteAlterung({ letzterKontakt: vor(20), offen: true }, JETZT),
    bewerteAlterung({ letzterKontakt: vor(40), offen: true }, JETZT),
    bewerteAlterung({ letzterKontakt: vor(2), wiedervorlage: vor(9), offen: true }, JETZT),
  ]

  it('zählt je Stufe, „gesamt" nur das Auffällige', () => {
    const z = zaehlePrioritaeten(bewertungen)
    expect(z).toMatchObject({ normal: 2, erhoeht: 1, hoch: 1, kritisch: 1 })
    expect(z.gesamt).toBe(3)
  })

  it('Eskalation schlägt Priorität in der Reihenfolge', () => {
    const sortiert = [...bewertungen].sort((a, b) => dringlichkeitsRang(b) - dringlichkeitsRang(a))
    // Der eskalierte Vorgang steht vorn, obwohl seine Priorität „normal" ist.
    expect(sortiert[0].eskalation).toBe(3)
    expect(sortiert[0].effektiv).toBe('normal')
    expect(sortiert[1].effektiv).toBe('kritisch')
  })

  it('bei gleicher Stufe entscheidet das Alter', () => {
    const alt = bewerteAlterung({ letzterKontakt: vor(300), offen: true }, JETZT)
    const juenger = bewerteAlterung({ letzterKontakt: vor(31), offen: true }, JETZT)
    expect(dringlichkeitsRang(alt)).toBeGreaterThan(dringlichkeitsRang(juenger))
  })

  it('jede Stufe hat Beschriftung und Farbe', () => {
    for (const p of PRIORITAETEN) {
      expect(PRIORITAET_META[p].label.length).toBeGreaterThan(0)
      expect(PRIORITAET_META[p].color).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})

describe('wiedervorlageIn', () => {
  it('liefert einen Kalendertag, keinen Zeitstempel', () => {
    expect(wiedervorlageIn(7, JETZT)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('rechnet in Berliner Tagen', () => {
    expect(wiedervorlageIn(0, JETZT)).toBe('2026-09-13')
    expect(wiedervorlageIn(7, JETZT)).toBe('2026-09-20')
  })
  it('nach 22 Uhr UTC zählt der Berliner Tag, nicht der UTC-Tag', () => {
    // 22:30 UTC ist in Berlin (UTC+2 im September) bereits der 14.09.
    // Eine UTC-Rechnung ergäbe „morgen = 14.09." und damit einen Termin,
    // der im Moment des Setzens schon heute ist.
    const spaet = new Date('2026-09-13T22:30:00.000Z')
    expect(wiedervorlageIn(0, spaet)).toBe('2026-09-14')
    expect(wiedervorlageIn(1, spaet)).toBe('2026-09-15')
  })
})

describe('Schwellen stehen an einer Stelle', () => {
  it('die Eskalationsschwellen sind aufsteigend', () => {
    const s = ESKALATION_SCHWELLEN_TAGE
    expect(s.stufe1).toBeLessThan(s.stufe2)
    expect(s.stufe2).toBeLessThan(s.stufe3)
  })
  it('die Alterungsschwellen sind aufsteigend', () => {
    const s = ALTERUNG_SCHWELLEN_TAGE
    expect(s.erhoeht).toBeLessThan(s.hoch)
    expect(s.hoch).toBeLessThan(s.kritisch)
  })
})
