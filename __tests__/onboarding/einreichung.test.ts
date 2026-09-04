/**
 * Bewerbung aus dem Fortschritt bauen
 *
 * Hier entscheidet sich, was die Verwaltung im Posteingang sieht. Zwei
 * Fehler wären teuer: eine Bewerbung, die an einer fehlenden Pflichtspalte
 * scheitert (dann ist sie unsichtbar), und eine, die ihre Lücken
 * verschweigt (dann fragt niemand nach).
 */

import { describe, it, expect } from 'vitest'
import { baueEinreichung } from '@/lib/onboarding/einreichung'
import type { SchrittEintrag } from '@/lib/onboarding/service'

const FORTSCHRITT = '5b2f1c8a-9d3e-4f70-8a61-2c4d6e8f0a13'
const ORG = '00000000-0000-4000-8000-000460629986'

function eintrag(daten: Record<string, unknown>): SchrittEintrag {
  return { status: 'fertig', daten, zeitpunkt: '2026-09-20T10:00:00Z' }
}

const VOLL: Record<string, SchrittEintrag> = {
  kontakt: eintrag({
    vorname: 'Erika', nachname: 'Müller', telefon: '069 1234567',
    email: 'erika@example.de', geburtsdatum: '1980-05-04',
  }),
  einsatzgebiet: eintrag({ plz: '60313', stadt: 'Frankfurt', radius_km: '15' }),
  absenden: eintrag({ gespraech_art: 'telefon', nachricht: 'Ich freue mich!', einwilligung: true }),
}

const basis = { fortschrittId: FORTSCHRITT, organizationId: ORG, fehlendeAngaben: [] }

describe('baueEinreichung', () => {
  it('setzt die Pflichtspalten aus den Kontaktdaten', () => {
    const e = baueEinreichung({ ...basis, schritteDaten: VOLL })
    expect(e.name).toBe('Erika Müller')
    expect(e.phone).toBe('069 1234567')
    expect(e.email).toBe('erika@example.de')
    expect(e.plz).toBe('60313')
  })

  it('markiert die Zeile als Bewerbung und bindet sie an den Ablauf', () => {
    // Ohne `art` landen Anfrage und Bewerbung im selben Posteingang und
    // werden mit derselben Antwort bedient.
    const e = baueEinreichung({ ...basis, schritteDaten: VOLL })
    expect(e.art).toBe('bewerbung')
    expect(e.onboarding_progress_id).toBe(FORTSCHRITT)
    expect(e.organization_id).toBe(ORG)
    expect(e.source).toBe('onboarding_wizard')
    expect(e.eingereicht_am).toBeTruthy()
  })

  it('friert die Antworten ein', () => {
    // Die Schrittfolge aendert sich; die eingegangene Bewerbung nicht.
    const e = baueEinreichung({ ...basis, schritteDaten: VOLL })
    const daten = e.bewerbung_daten as { schritte: Record<string, SchrittEintrag> }
    expect(daten.schritte.kontakt.daten.vorname).toBe('Erika')
    expect((e.bewerbung_daten as { eingefroren_am: string }).eingefroren_am).toBeTruthy()
  })

  it('scheitert NICHT an fehlendem Namen oder fehlender Telefonnummer', () => {
    // name und phone sind in lead_inquiries NOT NULL. Eine Bewerbung, die
    // daran scheitert, ist fuer die Verwaltung unsichtbar — und genau
    // darum geht es hier nicht.
    const e = baueEinreichung({ ...basis, schritteDaten: {} })
    expect(e.name).toBe('Ohne Namensangabe')
    expect(e.phone).toBe('Keine Angabe')
    expect(e.email).toBeNull()
    expect(e.plz).toBe('')
  })

  it('nimmt auch einen halben Namen an', () => {
    const e = baueEinreichung({
      ...basis, schritteDaten: { kontakt: eintrag({ vorname: 'Erika' }) },
    })
    expect(e.name).toBe('Erika')
  })

  it('nennt offene Angaben im Klartextfeld, nicht nur im jsonb', () => {
    // Was im Posteingang auffallen muss, darf nicht in einem Feld stehen,
    // das niemand aufklappt.
    const e = baueEinreichung({
      ...basis, schritteDaten: VOLL, fehlendeAngaben: ['lebenslauf', 'telefon'],
    })
    expect(e.message).toContain('Noch offen: lebenslauf, telefon')
  })

  it('übernimmt Nachricht und Gesprächswunsch', () => {
    const e = baueEinreichung({ ...basis, schritteDaten: VOLL })
    expect(e.message).toContain('Ich freue mich!')
    expect(e.message).toContain('Gesprächswunsch: telefon')
  })

  it('lässt message leer, wenn es nichts zu sagen gibt', () => {
    const e = baueEinreichung({
      ...basis,
      schritteDaten: { kontakt: eintrag({ vorname: 'E', nachname: 'M', telefon: '1' }) },
    })
    expect(e.message).toBeNull()
  })

  it('schneidet Leerzeichen ab', () => {
    const e = baueEinreichung({
      ...basis,
      schritteDaten: { kontakt: eintrag({ vorname: '  Erika  ', nachname: ' Müller ', telefon: ' 069 ' }) },
    })
    expect(e.name).toBe('Erika Müller')
    expect(e.phone).toBe('069')
  })
})
