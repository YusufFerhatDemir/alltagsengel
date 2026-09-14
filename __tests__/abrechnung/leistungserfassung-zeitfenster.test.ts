/**
 * Leistungserfassung — Zeitfenster am Engpass
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 44, 14.09.2026)
 *
 * `service_records.duration_minutes` ist GENERATED:
 *
 *     (EXTRACT(epoch FROM (end_time - start_time)))::int / 60
 *
 * und bestimmt den Rechnungsbetrag. Die Regel „Ende nach Beginn" stand an
 * vier Stellen in vier Formulierungen — im Tourenweg, in
 * /api/leistungsnachweis/crud, im SGB-V-Dienst und als DB-CHECK
 * `service_records_zeitfenster_gueltig` (live gelesen:
 * `end_time > start_time`). In `saveServiceRecord`, wo alle drei
 * Anwendungswege durchkommen, stand sie NICHT.
 *
 * Die Folge war nicht „der Insert scheitert". Die Retry-Schleife wertet
 * bei 23514 den Status ab und versucht es ein zweites Mal — ein
 * Zeitfenster-Verstoss hat denselben Fehlercode wie ein Status-Verstoss.
 * Der zweite Versuch scheiterte genauso, und beim Menschen kam der rohe
 * Constraint-Name an. Der Tourenweg sagt an derselben Stelle „bitte als
 * zwei Nachweise erfassen (bis 23:59 und ab 00:00)".
 */

import { describe, it, expect } from 'vitest'
import { saveServiceRecord } from '@/lib/admin/service-records'

const BASIS = {
  client_id: '00000000-0000-4000-8000-00000000f001',
  caregiver_id: '00000000-0000-4000-8000-00000000f002',
  date: '2026-09-14',
  service_type: 'Hauswirtschaftliche Versorgung',
  budget_type: 'entlastung',
  caregiver_initials: 'M.S.',
  status: 'complete',
}

/**
 * Datenbank-Attrappe, die den LIVE-CHECK nachbildet:
 * `start_time IS NULL OR end_time IS NULL OR end_time > start_time`.
 * Sie zaehlt mit, wie oft geschrieben wurde — die Retry-Schleife ist Teil
 * des Befunds.
 */
function datenbankMitZeitfensterCheck() {
  const versuche: Array<Record<string, unknown>> = []
  const client = {
    from(tabelle: string) {
      if (tabelle !== 'service_records') throw new Error(`Unerwartete Tabelle: ${tabelle}`)
      return {
        insert: (werte: Record<string, unknown>) => {
          versuche.push(werte)
          const s = String(werte.start_time ?? '')
          const e = String(werte.end_time ?? '')
          const gueltig = !s || !e || e > s
          return {
            select: () => ({
              single: async () =>
                gueltig
                  ? { data: { id: 'neue-id' }, error: null }
                  : {
                    data: null,
                    error: {
                      code: '23514',
                      message:
                          'new row for relation "service_records" violates check '
                          + 'constraint "service_records_zeitfenster_gueltig"',
                    },
                  },
            }),
          }
        },
      }
    },
  }
  return { client: client as never, versuche }
}

describe('saveServiceRecord — Zeitfenster', () => {
  it('legt einen gewoehnlichen Einsatz an', async () => {
    const { client, versuche } = datenbankMitZeitfensterCheck()
    const r = await saveServiceRecord(client, { ...BASIS, start_time: '09:00', end_time: '11:30' })
    expect(r.error).toBeNull()
    expect(r.id).toBe('neue-id')
    expect(versuche).toHaveLength(1)
  })

  it('weist den Nachtdienst ueber Mitternacht ab — mit der handlungsfaehigen Meldung', async () => {
    const { client, versuche } = datenbankMitZeitfensterCheck()
    const r = await saveServiceRecord(client, { ...BASIS, start_time: '22:00', end_time: '06:00' })
    expect(r.id).toBeNull()
    expect(r.error).toContain('zwei Nachweise')
    expect(r.error).toContain('23:59')
    // Der springende Punkt: gar kein Schreibversuch. Vorher waren es zwei,
    // und der Mensch sah den Constraint-Namen.
    expect(versuche).toHaveLength(0)
  })

  it('nennt die negative Dauer beim Namen', async () => {
    const { client } = datenbankMitZeitfensterCheck()
    const r = await saveServiceRecord(client, { ...BASIS, start_time: '22:00', end_time: '06:00' })
    expect(r.error).toContain('-960')
  })

  it('weist Beginn gleich Ende ab — genau wie der Live-CHECK (end_time > start_time)', async () => {
    const { client, versuche } = datenbankMitZeitfensterCheck()
    const r = await saveServiceRecord(client, { ...BASIS, start_time: '09:00', end_time: '09:00' })
    expect(r.id).toBeNull()
    expect(r.error).toContain('null')
    expect(versuche).toHaveLength(0)
  })

  it('weist eine unlesbare Uhrzeit ab, statt sie der Datenbank zu ueberlassen', async () => {
    const { client } = datenbankMitZeitfensterCheck()
    const r = await saveServiceRecord(client, { ...BASIS, start_time: '9 Uhr', end_time: '11:00' })
    expect(r.id).toBeNull()
    expect(r.error).toContain('HH:MM')
  })

  it('rechnet NICHT ueber Mitternacht hinweg — 24 h aufschlagen waere der falsche Fix', async () => {
    // Die generierte Spalte rechnet ohne diesen Zuschlag weiter; die
    // Anwendung meldete dann eine andere Dauer als die abgerechnete.
    const { client, versuche } = datenbankMitZeitfensterCheck()
    await saveServiceRecord(client, { ...BASIS, start_time: '23:00', end_time: '01:00' })
    expect(versuche).toHaveLength(0)
  })

  it('meldet degraded weiterhin false, wenn nichts geschrieben wurde', async () => {
    const { client } = datenbankMitZeitfensterCheck()
    const r = await saveServiceRecord(client, { ...BASIS, start_time: '22:00', end_time: '06:00' })
    expect(r.degraded).toBe(false)
  })
})
