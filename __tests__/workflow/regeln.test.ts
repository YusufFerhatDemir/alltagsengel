// ═══════════════════════════════════════════════════════════════
// Workflow-Regeln — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listRegeln,
  getRegel,
  createRegel,
  updateRegel,
  deleteRegel,
  toggleRegelAktiv,
  listAktionen,
  createAktion,
  deleteAktion,
} from '@/lib/workflow/regeln'

const ORG = '00000000-0000-4000-8000-000460629986'

const regelFixture = {
  id: 'r-1',
  organization_id: ORG,
  bezeichnung: 'Rechnung überfällig → Aufgabe',
  beschreibung: null,
  event_typ: 'rechnung_ueberfaellig',
  modul: 'abrechnung' as const,
  bedingungen: [],
  aktiv: true,
  prioritaet: 100,
  max_ausfuehrungen_pro_entity: null,
  cooldown_minuten: null,
  erstellt_von: 'u-1',
  ist_system: false,
  created_at: '2026-08-08T10:00:00Z',
  updated_at: '2026-08-08T10:00:00Z',
}

const aktionFixture = {
  id: 'a-1',
  organization_id: ORG,
  regel_id: 'r-1',
  reihenfolge: 1,
  typ: 'aufgabe_erstellen' as const,
  konfiguration: { titel: 'Rechnung prüfen' },
  aktiv: true,
  created_at: '2026-08-08T10:00:00Z',
}

describe('Workflow-Regeln', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  describe('listRegeln', () => {
    it('liefert gefilterte Ergebnisse zurueck', async () => {
      mock._setResult([regelFixture])
      const ergebnis = await listRegeln(mock.client as any, { organizationId: ORG, aktiv: true })
      expect(ergebnis).toHaveLength(1)
      expect(ergebnis[0].bezeichnung).toBe('Rechnung überfällig → Aufgabe')
      expect(mock.client.from).toHaveBeenCalledWith('wf_regeln')
    })

    it('wirft Fehler bei Datenbankproblem', async () => {
      mock._setResult(null, { message: 'Verbindungsfehler' })
      await expect(
        listRegeln(mock.client as any, { organizationId: ORG }),
      ).rejects.toThrow('Regeln konnten nicht geladen werden')
    })
  })

  describe('getRegel', () => {
    it('liefert Regel mit ID zurueck', async () => {
      mock._setResult(regelFixture)
      const ergebnis = await getRegel(mock.client as any, { organizationId: ORG, id: 'r-1' })
      expect(ergebnis?.id).toBe('r-1')
    })

    it('liefert null bei unbekannter ID', async () => {
      mock._setResult(null)
      const ergebnis = await getRegel(mock.client as any, { organizationId: ORG, id: 'nicht-vorhanden' })
      expect(ergebnis).toBeNull()
    })
  })

  describe('createRegel', () => {
    it('erstellt eine neue Regel', async () => {
      mock._setResult(regelFixture)
      const ergebnis = await createRegel(mock.client as any, {
        organizationId: ORG,
        data: { bezeichnung: regelFixture.bezeichnung, event_typ: regelFixture.event_typ, modul: 'abrechnung' },
      })
      expect(ergebnis.bezeichnung).toBe(regelFixture.bezeichnung)
      expect(mock.client.from).toHaveBeenCalledWith('wf_regeln')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('wirft Fehler bei fehlgeschlagenem Insert', async () => {
      mock._setResult(null, { message: 'Constraint-Verletzung' })
      await expect(
        createRegel(mock.client as any, { organizationId: ORG, data: { bezeichnung: 'Test' } }),
      ).rejects.toThrow('Regel konnte nicht erstellt werden')
    })
  })

  describe('updateRegel / toggleRegelAktiv', () => {
    it('aktualisiert eine Regel', async () => {
      const aktualisiert = { ...regelFixture, aktiv: false }
      mock._setResult(aktualisiert)
      const ergebnis = await updateRegel(mock.client as any, { organizationId: ORG, id: 'r-1', data: { aktiv: false } })
      expect(ergebnis.aktiv).toBe(false)
      expect(mock.queryBuilder.update).toHaveBeenCalled()
    })

    it('toggleRegelAktiv delegiert an updateRegel', async () => {
      const aktualisiert = { ...regelFixture, aktiv: false }
      mock._setResult(aktualisiert)
      const ergebnis = await toggleRegelAktiv(mock.client as any, { organizationId: ORG, id: 'r-1', aktiv: false })
      expect(ergebnis.aktiv).toBe(false)
    })

    it('wirft Fehler bei nicht gefundener Regel', async () => {
      mock._setResult(null, { message: 'Nicht gefunden' })
      await expect(
        updateRegel(mock.client as any, { organizationId: ORG, id: 'nicht-vorhanden', data: { aktiv: false } }),
      ).rejects.toThrow('Regel konnte nicht aktualisiert werden')
    })
  })

  describe('deleteRegel', () => {
    it('loescht eine Regel ohne Fehler', async () => {
      mock._setResult(null)
      await expect(
        deleteRegel(mock.client as any, { organizationId: ORG, id: 'r-1' }),
      ).resolves.toBeUndefined()
      expect(mock.queryBuilder.delete).toHaveBeenCalled()
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'FK-Verletzung' })
      await expect(
        deleteRegel(mock.client as any, { organizationId: ORG, id: 'r-1' }),
      ).rejects.toThrow('Regel konnte nicht geloescht werden')
    })
  })

  describe('Aktionen', () => {
    it('listAktionen liefert Aktionen einer Regel', async () => {
      mock._setResult([aktionFixture])
      const ergebnis = await listAktionen(mock.client as any, { organizationId: ORG, regelId: 'r-1' })
      expect(ergebnis).toHaveLength(1)
      expect(mock.client.from).toHaveBeenCalledWith('wf_aktionen')
    })

    it('createAktion erstellt eine neue Aktion', async () => {
      mock._setResult(aktionFixture)
      const ergebnis = await createAktion(mock.client as any, {
        organizationId: ORG,
        regelId: 'r-1',
        data: { typ: 'aufgabe_erstellen', konfiguration: { titel: 'Rechnung prüfen' } },
      })
      expect(ergebnis.typ).toBe('aufgabe_erstellen')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('deleteAktion loescht eine Aktion ohne Fehler', async () => {
      mock._setResult(null)
      await expect(
        deleteAktion(mock.client as any, { organizationId: ORG, regelId: 'r-1', id: 'a-1' }),
      ).resolves.toBeUndefined()
      expect(mock.queryBuilder.delete).toHaveBeenCalled()
    })

    it('deleteAktion wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'FK-Verletzung' })
      await expect(
        deleteAktion(mock.client as any, { organizationId: ORG, regelId: 'r-1', id: 'a-1' }),
      ).rejects.toThrow('Aktion konnte nicht geloescht werden')
    })
  })
})
