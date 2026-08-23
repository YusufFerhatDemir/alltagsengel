/**
 * Kette 12 — Terminerinnerung an Kunde und Angehoerige.
 * Lueckenanalyse Bereich 11, P2: Erinnerungen liefen bis 23.08.2026
 * ausschliesslich nach innen (Mitarbeiter/PDL), nie an den Kunden.
 * @see lib/automation/termin-erinnerung.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createAutomationMock } from './_mock'
import { erinnereAnKommendeTermine } from '@/lib/automation/termin-erinnerung'

const ORG = 'org-1'
/** Lauf am 09.06. → erinnert wird fuer den 10.06. */
const HEUTE = new Date('2026-06-09T08:00:00Z')

describe('erinnereAnKommendeTermine', () => {
  let mock: ReturnType<typeof createAutomationMock>

  beforeEach(() => {
    mock = createAutomationMock()
  })

  it('erinnert den Kunden an den Einsatz des Folgetags', async () => {
    mock.setzeAntwort('assignments', 'select', [
      {
        id: 'a-1', assignment_date: '2026-06-10', start_time: '10:00:00',
        end_time: '12:00:00', status: 'GEPLANT', service_type: 'Alltagsbegleitung',
        client_id: 'c-1',
      },
    ])
    mock.setzeAntwort('clients', 'select', [
      { id: 'c-1', user_id: 'u-kunde', first_name: 'Erika', last_name: 'Muster' },
    ])
    mock.setzeAntwort('angehoerigen_zugaenge', 'select', [])
    mock.setzeAntwort('notifications', 'select', null) // keine Dublette
    mock.setzeAntwort('notifications', 'insert', null)

    const r = await erinnereAnKommendeTermine(mock.client as any, ORG, HEUTE)

    expect(r.geprueft).toBe(1)
    expect(r.erinnert).toBe(1)
    expect(r.fehler).toEqual([])

    const benachrichtigung = mock.inserts.find(i => i.table === 'notifications')
    expect(benachrichtigung).toBeDefined()
    expect(benachrichtigung!.payload.user_id).toBe('u-kunde')
    expect(benachrichtigung!.payload.type).toBe('reminder')
    expect(benachrichtigung!.payload.body).toContain('2026-06-10')
    expect(benachrichtigung!.payload.body).toContain('10:00–12:00 Uhr')
    expect(benachrichtigung!.payload.data.assignment_id).toBe('a-1')
  })

  it('verlinkt Angehoerige ins Angehoerigenportal, nicht in den Kundenbereich', async () => {
    mock.setzeAntwort('assignments', 'select', [
      {
        id: 'a-1', assignment_date: '2026-06-10', start_time: '09:00:00',
        end_time: '10:00:00', status: 'GEPLANT', service_type: 'Einkauf', client_id: 'c-1',
      },
    ])
    // Kein user_id am Klienten → einziger Empfaenger ist der Angehoerige.
    mock.setzeAntwort('clients', 'select', [
      { id: 'c-1', user_id: null, first_name: 'Erika', last_name: 'Muster' },
    ])
    mock.setzeAntwort('angehoerigen_zugaenge', 'select', [
      { client_id: 'c-1', user_id: 'u-angeh' },
    ])
    mock.setzeAntwort('notifications', 'select', null)
    mock.setzeAntwort('notifications', 'insert', null)

    const r = await erinnereAnKommendeTermine(mock.client as any, ORG, HEUTE)

    expect(r.erinnert).toBe(1)
    const n = mock.inserts.find(i => i.table === 'notifications')!
    expect(n.payload.user_id).toBe('u-angeh')
    expect(n.payload.link).toBe('/angehoerige/termine')
  })

  it('stornierte und beendete Einsaetze werden nicht erinnert', async () => {
    mock.setzeAntwort('assignments', 'select', [
      { id: 'a-1', assignment_date: '2026-06-10', start_time: '10:00:00', end_time: '11:00:00', status: 'STORNIERT', service_type: 'X', client_id: 'c-1' },
      { id: 'a-2', assignment_date: '2026-06-10', start_time: '12:00:00', end_time: '13:00:00', status: 'BEENDET', service_type: 'X', client_id: 'c-1' },
    ])

    const r = await erinnereAnKommendeTermine(mock.client as any, ORG, HEUTE)

    expect(r.geprueft).toBe(0)
    expect(r.erinnert).toBe(0)
    expect(mock.inserts.filter(i => i.table === 'notifications')).toHaveLength(0)
  })

  it('ohne verknuepften Nutzer wird das laut gemeldet, nicht still verschluckt', async () => {
    // Live-Zustand: clients.user_id ist bei allen vier Klienten NULL.
    mock.setzeAntwort('assignments', 'select', [
      { id: 'a-1', assignment_date: '2026-06-10', start_time: '10:00:00', end_time: '11:00:00', status: 'GEPLANT', service_type: 'X', client_id: 'c-1' },
    ])
    mock.setzeAntwort('clients', 'select', [
      { id: 'c-1', user_id: null, first_name: 'Erika', last_name: 'Muster' },
    ])
    mock.setzeAntwort('angehoerigen_zugaenge', 'select', [])

    const r = await erinnereAnKommendeTermine(mock.client as any, ORG, HEUTE)

    expect(r.geprueft).toBe(1)
    expect(r.erinnert).toBe(0)
    expect(r.ohneEmpfaenger).toBe(1)
  })

  it('Dublettenschutz: eine bereits gesendete Erinnerung wird nicht wiederholt', async () => {
    mock.setzeAntwort('assignments', 'select', [
      { id: 'a-1', assignment_date: '2026-06-10', start_time: '10:00:00', end_time: '11:00:00', status: 'GEPLANT', service_type: 'X', client_id: 'c-1' },
    ])
    mock.setzeAntwort('clients', 'select', [
      { id: 'c-1', user_id: 'u-kunde', first_name: 'Erika', last_name: 'Muster' },
    ])
    mock.setzeAntwort('angehoerigen_zugaenge', 'select', [])
    mock.setzeAntwort('notifications', 'select', { id: 'n-alt' }) // schon erinnert

    const r = await erinnereAnKommendeTermine(mock.client as any, ORG, HEUTE)

    expect(r.erinnert).toBe(0)
    expect(mock.inserts.filter(i => i.table === 'notifications')).toHaveLength(0)
  })

  it('Fehler beim Laden der Einsaetze wird benannt zurueckgegeben', async () => {
    mock.setzeAntwort('assignments', 'select', null, { message: 'permission denied' })

    const r = await erinnereAnKommendeTermine(mock.client as any, ORG, HEUTE)

    expect(r.erinnert).toBe(0)
    expect(r.fehler[0]).toContain('permission denied')
  })
})
