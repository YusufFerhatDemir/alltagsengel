// ═══════════════════════════════════════════════════════════════
// Workflow-Events — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import { listEvents, getEvent, emitEvent } from '@/lib/workflow/events'

const ORG = '00000000-0000-4000-8000-000460629986'

const eventFixture = {
  id: 'e-1',
  organization_id: ORG,
  event_typ: 'rechnung_ueberfaellig',
  modul: 'abrechnung' as const,
  quell_tabelle: 'invoices',
  quell_id: 'inv-1',
  payload: { rechnung_nr: 'R-2026-001' },
  idempotency_key: 'rechnung_ueberfaellig:inv-1:2026-08-08',
  status: 'neu' as const,
  prioritaet: 'hoch' as const,
  ausgeloest_von: null,
  ausgeloest_am: '2026-08-08T10:00:00Z',
  verarbeitet_am: null,
  fehler_nachricht: null,
  retry_count: 0,
  max_retries: 3,
  naechster_retry: null,
  created_at: '2026-08-08T10:00:00Z',
}

describe('Workflow-Events', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  describe('listEvents', () => {
    it('liefert gefilterte Ergebnisse zurueck', async () => {
      mock._setResult([eventFixture])
      const ergebnis = await listEvents(mock.client as any, { organizationId: ORG, status: 'neu' })
      expect(ergebnis).toHaveLength(1)
      expect(ergebnis[0].event_typ).toBe('rechnung_ueberfaellig')
      expect(mock.client.from).toHaveBeenCalledWith('wf_events')
    })

    it('gibt leeres Array bei keinen Treffern zurueck', async () => {
      mock._setResult([])
      const ergebnis = await listEvents(mock.client as any, { organizationId: ORG })
      expect(ergebnis).toEqual([])
    })

    it('wirft Fehler bei Datenbankproblem', async () => {
      mock._setResult(null, { message: 'Verbindungsfehler' })
      await expect(
        listEvents(mock.client as any, { organizationId: ORG }),
      ).rejects.toThrow('Events konnten nicht geladen werden')
    })

    it('wendet Modul- und Event-Typ-Filter an', async () => {
      mock._setResult([eventFixture])
      await listEvents(mock.client as any, { organizationId: ORG, modul: 'abrechnung', eventTyp: 'rechnung_ueberfaellig', limit: 10 })
      expect(mock.queryBuilder.eq).toHaveBeenCalled()
      expect(mock.queryBuilder.limit).toHaveBeenCalled()
    })
  })

  describe('getEvent', () => {
    it('liefert Event mit ID zurueck', async () => {
      mock._setResult(eventFixture)
      const ergebnis = await getEvent(mock.client as any, { organizationId: ORG, id: 'e-1' })
      expect(ergebnis).not.toBeNull()
      expect(ergebnis?.id).toBe('e-1')
    })

    it('liefert null bei unbekannter ID', async () => {
      mock._setResult(null)
      const ergebnis = await getEvent(mock.client as any, { organizationId: ORG, id: 'nicht-vorhanden' })
      expect(ergebnis).toBeNull()
    })

    it('wirft Fehler bei Datenbankproblem', async () => {
      mock._setResult(null, { message: 'Verbindungsfehler' })
      await expect(
        getEvent(mock.client as any, { organizationId: ORG, id: 'e-1' }),
      ).rejects.toThrow('Event konnte nicht geladen werden')
    })
  })

  describe('emitEvent', () => {
    it('ruft wf_emit_event RPC auf und liefert Event-ID zurueck', async () => {
      mock._setRpcResult('e-neu')
      const ergebnis = await emitEvent(mock.client as any, {
        organizationId: ORG,
        eventTyp: 'rechnung_ueberfaellig',
        modul: 'abrechnung',
        quellTabelle: 'invoices',
        quellId: 'inv-1',
      })
      expect(ergebnis).toBe('e-neu')
      expect(mock.client.rpc).toHaveBeenCalledWith('wf_emit_event', expect.objectContaining({
        p_organization_id: ORG,
        p_event_typ: 'rechnung_ueberfaellig',
        p_modul: 'abrechnung',
        p_quell_tabelle: 'invoices',
        p_quell_id: 'inv-1',
      }))
    })

    it('liefert null bei Duplikat (Idempotenz)', async () => {
      mock._setRpcResult(null)
      const ergebnis = await emitEvent(mock.client as any, {
        organizationId: ORG,
        eventTyp: 'rechnung_ueberfaellig',
        modul: 'abrechnung',
        quellTabelle: 'invoices',
      })
      expect(ergebnis).toBeNull()
    })

    it('wirft Fehler bei RPC-Problem', async () => {
      mock._setRpcResult(null, { message: 'Funktion nicht gefunden' })
      await expect(
        emitEvent(mock.client as any, {
          organizationId: ORG,
          eventTyp: 'rechnung_ueberfaellig',
          modul: 'abrechnung',
          quellTabelle: 'invoices',
        }),
      ).rejects.toThrow('Event konnte nicht emittiert werden')
    })
  })
})
