/**
 * Arbeitskörbe des Posteingangs.
 * @see lib/leads/koerbe.ts
 *
 * Der Kern der Prüfung ist nicht, dass die Körbe füllen — sondern dass
 * **kein offener Lead in keinem Korb landet**. Genau so entstand der
 * Rückstand vom 12.09.2026: 38 Vorgänge, die in keiner Arbeitsliste standen.
 */
import { describe, it, expect } from 'vitest'
import {
  KOERBE, korb, inKorb, zaehleKoerbe, korbGesamt, ohneKorb, type KorbKey,
} from '@/lib/leads/koerbe'
import type { PosteingangEintrag } from '@/lib/leads/posteingang'
import type { FollowUpStufe } from '@/lib/leads/follow-up'

const JETZT = new Date('2026-09-12T10:00:00Z')   // Berliner Tag: 2026-09-12

function eintrag(teil: Partial<PosteingangEintrag> = {}): PosteingangEintrag {
  return {
    id: 'l1', art: 'anfrage', name: 'Test', kontakt: null,
    stufe: 'neu', stufeLabel: 'Neu', stufeFarbe: '#000',
    eingang: '2026-09-12T08:00:00Z', zuletzt: null, wiedervorlage: null,
    followUp: 'keine' as FollowUpStufe, ampel: 'gruen',
    stundenOffen: 2, punkte: 0, hinweis: '', ziel: '/mis/crm', quelle: null,
    ...teil,
  }
}

describe('Korbdefinitionen', () => {
  it('genau die sieben beauftragten Körbe', () => {
    expect(KOERBE.map(k => k.key)).toEqual([
      'heute', 'ueberfaellig', 'dringend', 'neu',
      'terminwuensche', 'rueckrufe', 'bewerber',
    ])
  })

  it('jeder Korb erklärt sich selbst', () => {
    for (const k of KOERBE) {
      expect(k.label.length, k.key).toBeGreaterThan(2)
      expect(k.bedeutung.length, k.key).toBeGreaterThan(15)
      expect(k.color, k.key).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('korb() wirft bei unbekanntem Schlüssel statt still etwas Falsches zu liefern', () => {
    expect(() => korb('gibtsnicht' as KorbKey)).toThrow(/Unbekannter Korb/)
  })
})

describe('Zuordnung', () => {
  it('heute fällig: Wiedervorlage auf dem Berliner Kalendertag', () => {
    const e = eintrag({ wiedervorlage: '2026-09-12T00:00:00.000Z' })
    expect(inKorb([e], 'heute', JETZT)).toHaveLength(1)
    expect(inKorb([e], 'ueberfaellig', JETZT)).toHaveLength(0)
  })

  it('überfällig: Wiedervorlage lag vor heute', () => {
    const e = eintrag({ wiedervorlage: '2026-09-10T00:00:00.000Z' })
    expect(inKorb([e], 'ueberfaellig', JETZT)).toHaveLength(1)
    expect(inKorb([e], 'heute', JETZT)).toHaveLength(0)
  })

  it('künftige Wiedervorlage liegt in keinem der beiden Zeitkörbe', () => {
    const e = eintrag({ wiedervorlage: '2026-09-20T00:00:00.000Z' })
    expect(inKorb([e], 'heute', JETZT)).toHaveLength(0)
    expect(inKorb([e], 'ueberfaellig', JETZT)).toHaveLength(0)
  })

  it('dringend umfasst auch „verschleppt" — dieselbe Leiter, schärfere Stufe', () => {
    for (const stufe of ['dringend', 'verschleppt'] as FollowUpStufe[]) {
      expect(inKorb([eintrag({ followUp: stufe })], 'dringend', JETZT), stufe).toHaveLength(1)
    }
    for (const stufe of ['keine', 'erinnerung', 'eskalation'] as FollowUpStufe[]) {
      expect(inKorb([eintrag({ followUp: stufe })], 'dringend', JETZT), stufe).toHaveLength(0)
    }
  })

  it('neu: unter 24 h UND noch keine Stufe', () => {
    expect(inKorb([eintrag({ followUp: 'keine', stundenOffen: 3 })], 'neu', JETZT)).toHaveLength(1)
    // 30 h ohne Stufe wäre widersprüchlich — der Korb verlangt beides
    expect(inKorb([eintrag({ followUp: 'keine', stundenOffen: 30 })], 'neu', JETZT)).toHaveLength(0)
    expect(inKorb([eintrag({ followUp: 'erinnerung', stundenOffen: 3 })], 'neu', JETZT)).toHaveLength(0)
  })

  it('Terminwünsche und Rückrufe kommen aus der Quelle', () => {
    expect(inKorb([eintrag({ quelle: 'terminbuchung' })], 'terminwuensche', JETZT)).toHaveLength(1)
    expect(inKorb([eintrag({ quelle: 'rueckruf' })], 'rueckrufe', JETZT)).toHaveLength(1)
    expect(inKorb([eintrag({ quelle: 'alltagsbegleitung-darmstadt' })], 'rueckrufe', JETZT)).toHaveLength(0)
  })

  it('Bewerber kommt aus der Art, nicht aus der Quelle', () => {
    expect(inKorb([eintrag({ art: 'bewerbung' })], 'bewerber', JETZT)).toHaveLength(1)
    expect(inKorb([eintrag({ art: 'anfrage' })], 'bewerber', JETZT)).toHaveLength(0)
  })
})

describe('Überlappung ist Absicht', () => {
  it('ein überfälliger Bewerber steht in BEIDEN Körben', () => {
    const e = eintrag({
      art: 'bewerbung', followUp: 'verschleppt', stundenOffen: 400,
      wiedervorlage: '2026-09-05T00:00:00.000Z',
    })
    expect(inKorb([e], 'bewerber', JETZT)).toHaveLength(1)
    expect(inKorb([e], 'ueberfaellig', JETZT)).toHaveLength(1)
    expect(inKorb([e], 'dringend', JETZT)).toHaveLength(1)
  })

  it('die Summe der Korbgrößen ist größer als die Zahl der Leads — kein Fehler', () => {
    const e = eintrag({
      art: 'bewerbung', followUp: 'dringend', stundenOffen: 100,
      wiedervorlage: '2026-09-01T00:00:00.000Z',
    })
    const z = zaehleKoerbe([e], JETZT)
    const summe = Object.values(z).reduce((a, b) => a + b, 0)
    expect(summe).toBeGreaterThan(1)
    expect(korbGesamt([e], JETZT)).toBe(1)
  })
})

describe('ohneKorb — der wichtigste Rückgabewert', () => {
  it('findet den Lead, den keine Arbeitsliste zeigt', () => {
    // Eskalation (48 h), keine Wiedervorlage, keine besondere Quelle,
    // Kundenanfrage: fällt durch alle sieben Körbe.
    const luecke = eintrag({ followUp: 'eskalation', stundenOffen: 50, wiedervorlage: null })
    expect(zaehleKoerbe([luecke], JETZT)).toEqual({
      heute: 0, ueberfaellig: 0, dringend: 0, neu: 0,
      terminwuensche: 0, rueckrufe: 0, bewerber: 0,
    })
    expect(ohneKorb([luecke], JETZT)).toHaveLength(1)
    expect(korbGesamt([luecke], JETZT)).toBe(0)
  })

  it('ein Lead in mindestens einem Korb gilt nicht als Lücke', () => {
    expect(ohneKorb([eintrag({ followUp: 'dringend' })], JETZT)).toHaveLength(0)
  })

  it('leere Liste ergibt leere Zählung, keinen Absturz', () => {
    expect(korbGesamt([], JETZT)).toBe(0)
    expect(ohneKorb([], JETZT)).toEqual([])
  })
})
