import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { meldeAbrechnungsfehler } from '@/lib/automation/abrechnung-fehler-aufgabe'

const ORG = 'org-1'
const ACTOR = 'actor-1'

describe('abrechnung-fehler-aufgabe — Kette 9', () => {
  it('keine fehlgeschlagenen Prüfpunkte → keine Aufgabe', async () => {
    const mock = createAutomationMock()
    const ergebnis = await meldeAbrechnungsfehler(mock.client as any, {
      organizationId: ORG, actorId: ACTOR, abrechnungsmonat: '2026-08', bundesland: 'hessen',
      fehlgeschlagenePruefpunkte: [],
    })
    expect(ergebnis.erstellt).toBe(false)
    expect(mock.inserts).toHaveLength(0)
  })

  it('fehlgeschlagene Prüfpunkte → Aufgabe an PDL', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await meldeAbrechnungsfehler(mock.client as any, {
      organizationId: ORG, actorId: ACTOR, abrechnungsmonat: '2026-08', bundesland: 'hessen',
      fehlgeschlagenePruefpunkte: [{ label: 'Anerkennungsstatus', details: 'nicht ANERKANNT' }],
    })

    expect(ergebnis.erstellt).toBe(true)
    expect(ergebnis.aufgabeId).toBe('neue-aufgabe')
    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.metadata.abrechnungsmonat).toBe('2026-08')
    expect(insert?.payload.prioritaet).toBe('hoch')
  })

  it('bereits offene Aufgabe für denselben Monat → Dublette', async () => {
    const mock = createAutomationMock()
    mock.setzeAntwort('ops_aufgaben', 'select', { id: 'bereits-offen' })

    const ergebnis = await meldeAbrechnungsfehler(mock.client as any, {
      organizationId: ORG, actorId: ACTOR, abrechnungsmonat: '2026-08', bundesland: 'hessen',
      fehlgeschlagenePruefpunkte: [{ label: 'Bescheid', details: 'fehlt' }],
    })

    expect(ergebnis.erstellt).toBe(false)
    expect(ergebnis.dublette).toBe(true)
    expect(mock.inserts.filter(i => i.table === 'ops_aufgaben')).toHaveLength(0)
  })
})
