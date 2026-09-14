import { describe, it, expect } from 'vitest'
import { createAutomationMock } from './_mock'
import { pruefeMonatsabschlussVollstaendigkeit } from '@/lib/automation/monatsabschluss-pruefung'

const ORG = 'org-1'
const ACTOR = 'actor-1'

describe('monatsabschluss-pruefung — Kette 7', () => {
  it('alle Nachweise vollständig → keine Aufgabe', async () => {
    const mock = createAutomationMock()
    const urspruenglichesFrom = mock.client.from
    mock.client.from = ((table: string) => {
      if (table === 'service_records') {
        return { select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ in: () => Promise.resolve({ count: 0, error: null }) }) }) }) }) } as any
      }
      return urspruenglichesFrom(table)
    }) as any

    const ergebnis = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)
    expect(ergebnis.unvollstaendig).toBe(0)
    expect(ergebnis.aufgabeErstellt).toBe(false)
  })

  it('unvollständige Nachweise → Aufgabe an PDL', async () => {
    const mock = createAutomationMock()
    const urspruenglichesFrom = mock.client.from
    mock.client.from = ((table: string) => {
      if (table === 'service_records') {
        return { select: () => ({ eq: () => ({ gte: () => ({ lte: () => ({ in: () => Promise.resolve({ count: 3, error: null }) }) }) }) }) } as any
      }
      return urspruenglichesFrom(table)
    }) as any
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })

    const ergebnis = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)

    expect(ergebnis.unvollstaendig).toBe(3)
    expect(ergebnis.aufgabeErstellt).toBe(true)
    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.metadata.unvollstaendig).toBe(3)
  })

  /**
   * ── DER UNSICHTBARE FALL ─────────────────────────────────────────────
   *
   * Am 14.09.2026 live gefunden: dreizehn Nachweise aus vier Monaten stehen
   * auf `signed`, tragen aber `proof_status='ENTWURF'` und keinen Hash.
   *
   * Fuer die Zaehlung auf draft/incomplete sind sie fertig — die
   * Nachweisliste zeigt sie als erledigt. Der Sammelrechnungslauf
   * ueberspringt sie trotzdem mit UNTERSCHRIFT_FEHLT, weil er den BELEG
   * verlangt und nicht das Statuswort. Die Leistung ist erbracht, die
   * Rechnung kommt nie, und bis hierher zeigte es keine Liste an.
   */
  function mockMitNachweisen(unvollstaendig: number, fertige: unknown[]) {
    const mock = createAutomationMock()
    const urspruenglichesFrom = mock.client.from
    mock.client.from = ((table: string) => {
      if (table === 'service_records') {
        return {
          // Die erste Abfrage zaehlt (head), die zweite liest Spalten.
          select: (spalten: string) => spalten.includes('proof_status')
            ? { eq: () => ({ gte: () => ({ lte: () => ({ in: () => Promise.resolve({ data: fertige, error: null }) }) }) }) }
            : { eq: () => ({ gte: () => ({ lte: () => ({ in: () => Promise.resolve({ count: unvollstaendig, error: null }) }) }) }) },
        } as any
      }
      return urspruenglichesFrom(table)
    }) as any
    mock.setzeAntwort('ops_aufgaben', 'select', null)
    mock.setzeAntwort('organization_members', 'select', [{ user_id: 'user-pdl-1' }])
    mock.setzeAntwort('profiles', 'select', [{ id: 'user-pdl-1' }])
    mock.setzeAntwort('ops_aufgaben', 'insert', { id: 'neue-aufgabe' })
    return mock
  }

  it('meldet Nachweise, die fertig AUSSEHEN, aber keinen Beleg tragen', async () => {
    const mock = mockMitNachweisen(0, [
      { id: 'a', proof_status: 'ENTWURF', signature_hash: null },
      { id: 'b', proof_status: 'ENTWURF', signature_hash: null },
    ])
    const e = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)

    expect(e.unvollstaendig).toBe(0)
    expect(e.ohneBeleg).toBe(2)
    expect(e.aufgabeErstellt).toBe(true)

    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.metadata.ohne_beleg).toBe(2)
    expect(insert?.payload.titel).toMatch(/ohne Unterschriftsbeleg/)
    // Der Hinweis muss sagen, WAS passiert — nicht nur, dass etwas fehlt.
    expect(insert?.payload.beschreibung).toMatch(/UNTERSCHRIFT_FEHLT/)
    expect(insert?.payload.tags).toContain('unterschrift_fehlt')
  })

  it('zaehlt einen Nachweis MIT Beleg nicht mit', async () => {
    // Beide Wege gelten: proof_status oder Hash. Dieselbe Regel wie
    // `istUnterschrieben` in lib/billing/core/sammelrechnung.ts.
    const mock = mockMitNachweisen(0, [
      { id: 'a', proof_status: 'UNTERSCHRIEBEN', signature_hash: null },
      { id: 'b', proof_status: 'ENTWURF', signature_hash: 'abc123' },
    ])
    const e = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)

    expect(e.ohneBeleg).toBe(0)
    expect(e.aufgabeErstellt).toBe(false)
  })

  it('nennt beide Zahlen, wenn beides zutrifft', async () => {
    const mock = mockMitNachweisen(3, [{ id: 'a', proof_status: 'ENTWURF', signature_hash: null }])
    const e = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)

    expect(e.unvollstaendig).toBe(3)
    expect(e.ohneBeleg).toBe(1)
    const insert = mock.inserts.find(i => i.table === 'ops_aufgaben')
    expect(insert?.payload.titel).toMatch(/3 unvollständig/)
    expect(insert?.payload.titel).toMatch(/1 ohne Unterschriftsbeleg/)
  })

  it('legt keine Aufgabe an, wenn beides null ist', async () => {
    const mock = mockMitNachweisen(0, [])
    const e = await pruefeMonatsabschlussVollstaendigkeit(mock.client as any, ORG, ACTOR)

    expect(e.unvollstaendig).toBe(0)
    expect(e.ohneBeleg).toBe(0)
    expect(e.aufgabeErstellt).toBe(false)
    expect(mock.inserts.find(i => i.table === 'ops_aufgaben')).toBeUndefined()
  })
})
