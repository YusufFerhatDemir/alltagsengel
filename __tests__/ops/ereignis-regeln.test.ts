// ═══════════════════════════════════════════════════════════════
// Ereignis-Regeln — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listEreignisRegeln,
  createEreignisRegel,
  updateEreignisRegel,
  deleteEreignisRegel,
} from '@/lib/ops/ereignis-regeln'

const ORG = '00000000-0000-4000-8000-000460629986'

function regelFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'evr-1',
    organization_id: ORG,
    name: 'Aufgabe faellig -> PDL benachrichtigen',
    beschreibung: 'Sendet eine Benachrichtigung wenn eine Aufgabe faellig wird',
    ereignis_typ: 'aufgabe_faellig' as const,
    empfaenger_rolle: 'pdl' as const,
    empfaenger_user_id: null,
    nachricht_vorlage: 'Die Aufgabe "{titel}" ist faellig.',
    titel_vorlage: 'Aufgabe faellig: {titel}',
    prioritaet: 'normal' as const,
    kategorie: 'aufgabe' as const,
    aktiv: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

describe('Ereignis-Regeln', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listEreignisRegeln ────────────────────────────────────────

  describe('listEreignisRegeln', () => {
    it('liefert aktive Regeln', async () => {
      const regeln = [
        regelFixture({ id: 'evr-1', aktiv: true }),
        regelFixture({ id: 'evr-2', aktiv: true, name: 'Wiedervorlage faellig' }),
      ]
      mock._setResult(regeln)

      const ergebnis = await listEreignisRegeln(mock.client as any, {
        organizationId: ORG,
        aktiv: true,
      })

      expect(ergebnis).toHaveLength(2)
      expect(mock.client.from).toHaveBeenCalledWith('ops_ereignis_regeln')
    })

    it('liefert inaktive Regeln', async () => {
      mock._setResult([regelFixture({ aktiv: false })])

      const ergebnis = await listEreignisRegeln(mock.client as any, {
        organizationId: ORG,
        aktiv: false,
      })

      expect(ergebnis).toHaveLength(1)
      expect(ergebnis[0].aktiv).toBe(false)
    })

    it('liefert alle Regeln ohne Filter', async () => {
      const alle = [
        regelFixture({ aktiv: true }),
        regelFixture({ id: 'evr-2', aktiv: false }),
      ]
      mock._setResult(alle)

      const ergebnis = await listEreignisRegeln(mock.client as any, {
        organizationId: ORG,
      })

      expect(ergebnis).toHaveLength(2)
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Tabelle nicht gefunden' })

      await expect(
        listEreignisRegeln(mock.client as any, { organizationId: ORG }),
      ).rejects.toThrow('Ereignisregeln konnten nicht geladen werden')
    })
  })

  // ── createEreignisRegel ───────────────────────────────────────

  describe('createEreignisRegel', () => {
    it('erstellt eine neue Ereignis-Regel', async () => {
      mock._setResult(regelFixture({ id: 'evr-neu' }))

      const ergebnis = await createEreignisRegel(mock.client as any, {
        organizationId: ORG,
        data: {
          name: 'Aufgabe faellig -> PDL benachrichtigen',
          beschreibung: null,
          ereignis_typ: 'aufgabe_faellig',
          empfaenger_rolle: 'pdl',
          empfaenger_user_id: null,
          nachricht_vorlage: 'Die Aufgabe "{titel}" ist faellig.',
          titel_vorlage: 'Aufgabe faellig: {titel}',
          prioritaet: 'normal',
          kategorie: 'aufgabe',
          aktiv: true,
        },
      })

      expect(ergebnis.name).toBe('Aufgabe faellig -> PDL benachrichtigen')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('wirft Fehler bei Duplikat', async () => {
      mock._setResult(null, { message: 'Duplikat' })

      await expect(
        createEreignisRegel(mock.client as any, {
          organizationId: ORG,
          data: {
            name: 'Duplikat',
            beschreibung: null,
            ereignis_typ: 'aufgabe_faellig',
            empfaenger_rolle: 'pdl',
            empfaenger_user_id: null,
            nachricht_vorlage: 'Test',
            titel_vorlage: 'Test',
            prioritaet: 'normal',
            kategorie: 'aufgabe',
            aktiv: true,
          },
        }),
      ).rejects.toThrow('Ereignisregel konnte nicht erstellt werden')
    })
  })

  // ── updateEreignisRegel ───────────────────────────────────────

  describe('updateEreignisRegel', () => {
    it('deaktiviert eine Regel', async () => {
      mock._setResult(regelFixture({ aktiv: false }))

      const ergebnis = await updateEreignisRegel(mock.client as any, {
        organizationId: ORG,
        id: 'evr-1',
        data: { aktiv: false },
      })

      expect(ergebnis.aktiv).toBe(false)
      expect(mock.queryBuilder.update).toHaveBeenCalled()
    })

    it('aendert Empfaengerrolle', async () => {
      mock._setResult(regelFixture({ empfaenger_rolle: 'geschaeftsfuehrung' }))

      const ergebnis = await updateEreignisRegel(mock.client as any, {
        organizationId: ORG,
        id: 'evr-1',
        data: { empfaenger_rolle: 'geschaeftsfuehrung' },
      })

      expect(ergebnis.empfaenger_rolle).toBe('geschaeftsfuehrung')
    })

    it('wirft Fehler bei nicht gefundener Regel', async () => {
      mock._setResult(null, { message: 'Nicht gefunden' })

      await expect(
        updateEreignisRegel(mock.client as any, {
          organizationId: ORG,
          id: 'nicht-vorhanden',
          data: { aktiv: false },
        }),
      ).rejects.toThrow('Ereignisregel konnte nicht aktualisiert werden')
    })
  })

  // ── deleteEreignisRegel ───────────────────────────────────────

  describe('deleteEreignisRegel', () => {
    it('loescht eine Regel', async () => {
      mock._setResult(null)

      await expect(
        deleteEreignisRegel(mock.client as any, { organizationId: ORG, id: 'evr-1' }),
      ).resolves.toBeUndefined()

      expect(mock.queryBuilder.delete).toHaveBeenCalled()
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'FK-Verletzung (Historie referenziert)' })

      await expect(
        deleteEreignisRegel(mock.client as any, { organizationId: ORG, id: 'evr-1' }),
      ).rejects.toThrow('Ereignisregel konnte nicht geloescht werden')
    })
  })
})
