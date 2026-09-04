/**
 * Erinnerungslauf — die Planung
 *
 * Jede Nachricht geht an einen Menschen, der sich gerade NICHT gemeldet
 * hat. Die Tests halten deshalb vor allem fest, wann NICHT erinnert wird:
 * zu früh, zu oft, nach Widerspruch, ohne Adresse. Eine ausbleibende
 * Erinnerung kostet einen Kontakt — eine zu viel kostet Vertrauen und
 * landet beim nächsten Mal im Spamordner, samt allem anderen, was wir
 * dieser Person je schreiben.
 */

import { describe, it, expect } from 'vitest'
import { alsHtml, planeErinnerungen, type ErinnerungsEmpfaenger } from '@/lib/onboarding/erinnerungen'
import { ERINNERUNGS_STUFEN, MAX_ERINNERUNGEN } from '@/lib/onboarding/triggers'
import { gesamtSchritte } from '@/lib/onboarding/schritte'
import type { OnboardingFortschritt } from '@/lib/onboarding/service'

const JETZT = new Date('2026-09-20T08:00:00Z')
const vorTagen = (n: number) => new Date(JETZT.getTime() - n * 86_400_000).toISOString()

const USER = 'u1'

function ablauf(ueber: Partial<OnboardingFortschritt> = {}): OnboardingFortschritt {
  return {
    id: 'a1', userId: USER, organizationId: 'org', typ: 'kunde',
    aktuellerSchritt: 3, gesamtSchritte: gesamtSchritte('kunde'),
    schritteDaten: {}, fehlendeAngaben: [], dokumentStatus: {},
    letzteAutoNachricht: null, abbruchstelle: null, abgeschlossenAm: null,
    createdAt: vorTagen(10), updatedAt: vorTagen(5),
    ...ueber,
  }
}

const person: ErinnerungsEmpfaenger = {
  userId: USER, email: 'erika@example.de', nachname: 'Müller', anredeform: null,
}

function plane(
  ablaeufe: OnboardingFortschritt[],
  opt: { gesperrt?: string[]; bisher?: number; empfaenger?: ErinnerungsEmpfaenger | null } = {},
) {
  const map = new Map<string, ErinnerungsEmpfaenger>()
  if (opt.empfaenger !== null) map.set(USER, opt.empfaenger ?? person)
  return planeErinnerungen({
    ablaeufe,
    empfaenger: map,
    keineNachricht: new Set(opt.gesperrt ?? []),
    bisherigeErinnerungen: () => opt.bisher ?? 0,
    jetzt: JETZT,
  })
}

describe('Wann erinnert wird', () => {
  it('nach der ersten Stufe', () => {
    const plan = plane([ablauf({ updatedAt: vorTagen(ERINNERUNGS_STUFEN[0].nachTagenInaktiv) })])
    expect(plan.geplant).toHaveLength(1)
    expect(plan.geplant[0].stufe).toBe(1)
    expect(plan.geplant[0].anlass).toBe('erinnerung')
  })

  it('wählt den Unterlagen-Anlass, wenn konkrete Angaben fehlen', () => {
    const plan = plane([ablauf({ fehlendeAngaben: ['telefon'] })])
    expect(plan.geplant[0].anlass).toBe('unterlagen')
  })

  it('vergibt je Stufe eine eigene Vorgangs-ID', () => {
    // Sonst könnte Stufe 2 nie rausgehen: der Idempotenz-Riegel greift
    // auf (correlation_id, channel).
    const eins = plane([ablauf()], { bisher: 0 }).geplant[0]
    const zwei = plane([ablauf({ updatedAt: vorTagen(5), letzteAutoNachricht: vorTagen(4) })],
      { bisher: 1 }).geplant[0]
    expect(eins.correlationId).not.toBe(zwei.correlationId)
    expect(eins.correlationId).toContain(':erinnerung:1')
    expect(zwei.correlationId).toContain(':erinnerung:2')
  })
})

describe('Wann NICHT erinnert wird', () => {
  it('nicht vor der ersten Stufe', () => {
    const plan = plane([ablauf({ updatedAt: vorTagen(0) })])
    expect(plan.geplant).toHaveLength(0)
    expect(plan.uebersprungen[0].grund).toMatch(/Stufe 1/)
  })

  it('nicht nach der Höchstzahl — keine Spam-Schleife', () => {
    const plan = plane([ablauf({ updatedAt: vorTagen(90) })], { bisher: MAX_ERINNERUNGEN })
    expect(plan.geplant).toHaveLength(0)
    expect(plan.uebersprungen[0].grund).toMatch(/Hoechstzahl|Höchstzahl/)
  })

  it('nicht bei abgeschlossenem Ablauf', () => {
    const plan = plane([ablauf({ abgeschlossenAm: vorTagen(1) })])
    expect(plan.geplant).toHaveLength(0)
  })

  it('nicht an gesperrte Adressen', () => {
    // Wer uns als Spam gemeldet hat, bekommt auch keinen freundlichen Anstoß.
    const plan = plane([ablauf()], { gesperrt: ['erika@example.de'] })
    expect(plan.geplant).toHaveLength(0)
    expect(plan.uebersprungen[0].grund).toMatch(/gesperrt|widersprochen/)
  })

  it('nicht ohne E-Mail-Adresse', () => {
    const plan = plane([ablauf()], { empfaenger: { ...person, email: null } })
    expect(plan.geplant).toHaveLength(0)
    expect(plan.uebersprungen[0].grund).toMatch(/Keine E-Mail/)
  })

  it('nicht ohne bekannten Empfänger', () => {
    const plan = plane([ablauf()], { empfaenger: null })
    expect(plan.geplant).toHaveLength(0)
  })

  it('hält jeden Ausschluss mit Grund fest', () => {
    // Ein Lauf, der nur „3 versendet" sagt, verbirgt genau die Fälle,
    // die jemand sehen müsste.
    const plan = plane([ablauf({ updatedAt: vorTagen(0) })])
    expect(plan.uebersprungen[0].fortschrittId).toBe('a1')
    expect(plan.uebersprungen[0].grund.length).toBeGreaterThan(10)
  })
})

describe('Mehrere Abläufe', () => {
  it('entscheidet je Ablauf einzeln', () => {
    const plan = plane([
      ablauf({ id: 'faellig', updatedAt: vorTagen(5) }),
      ablauf({ id: 'zu_frisch', updatedAt: vorTagen(0) }),
      ablauf({ id: 'fertig', abgeschlossenAm: vorTagen(1) }),
    ])
    expect(plan.geplant.map(g => g.fortschrittId)).toEqual(['faellig'])
    expect(plan.uebersprungen).toHaveLength(2)
  })
})

describe('HTML-Fassung', () => {
  it('escapt Nutzereingaben', () => {
    // Ein Nachname mit spitzer Klammer wäre sonst eine Lücke in jeder Mail.
    expect(alsHtml('Hallo <script>alert(1)</script>,')).not.toContain('<script>')
    expect(alsHtml('Hallo <b>')).toContain('&lt;b&gt;')
  })

  it('macht aus Absätzen Absätze und aus Zeilenumbrüchen <br>', () => {
    const html = alsHtml('Erste Zeile\nZweite Zeile\n\nNeuer Absatz')
    expect((html.match(/<p /g) ?? [])).toHaveLength(2)
    expect(html).toContain('<br/>')
  })
})
