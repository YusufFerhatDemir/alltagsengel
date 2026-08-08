// ═══════════════════════════════════════════════════════════════
// Checklisten CRUD — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listChecklisten,
  createChecklistenItem,
  updateChecklistenItem,
  deleteChecklistenItem,
} from '@/lib/ops/checklisten'

const ORG = '00000000-0000-4000-8000-000460629986'
const AUFGABE_ID = 'a-1'

function checkItem(over: Record<string, unknown> = {}) {
  return {
    id: 'ch-1',
    organization_id: ORG,
    aufgabe_id: AUFGABE_ID,
    titel: 'Unterlagen einsammeln',
    position: 1,
    erledigt: false,
    erledigt_von: null,
    erledigt_am: null,
    created_at: '2026-08-08T10:00:00Z',
    ...over,
  }
}

describe('Checklisten', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listChecklisten ───────────────────────────────────────────

  describe('listChecklisten', () => {
    it('liefert alle Items einer Aufgabe sortiert nach Position', async () => {
      const items = [
        checkItem({ id: 'ch-1', position: 1, titel: 'Unterlagen' }),
        checkItem({ id: 'ch-2', position: 2, titel: 'Unterschrift' }),
        checkItem({ id: 'ch-3', position: 3, titel: 'Versand' }),
      ]
      mock._setResult(items)

      const ergebnis = await listChecklisten(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
      })

      expect(ergebnis).toHaveLength(3)
      expect(ergebnis[0].titel).toBe('Unterlagen')
      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben_checklisten')
    })

    it('gibt leeres Array zurueck wenn keine Items vorhanden', async () => {
      mock._setResult([])

      const ergebnis = await listChecklisten(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
      })

      expect(ergebnis).toEqual([])
    })

    it('wirft Fehler bei Datenbankproblem', async () => {
      mock._setResult(null, { message: 'Timeout' })

      await expect(
        listChecklisten(mock.client as any, { organizationId: ORG, aufgabeId: AUFGABE_ID }),
      ).rejects.toThrow('Checkliste konnte nicht geladen werden')
    })
  })

  // ── createChecklistenItem ─────────────────────────────────────

  describe('createChecklistenItem', () => {
    it('erstellt einen neuen Checklistenpunkt', async () => {
      const neuesItem = checkItem({ id: 'ch-neu', titel: 'Arztbrief kopieren', position: 4 })
      mock._setResult(neuesItem)

      const ergebnis = await createChecklistenItem(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        titel: 'Arztbrief kopieren',
        position: 4,
      })

      expect(ergebnis.titel).toBe('Arztbrief kopieren')
      expect(ergebnis.position).toBe(4)
      expect(ergebnis.erledigt).toBe(false)
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('wirft Fehler bei fehlgeschlagenem Insert', async () => {
      mock._setResult(null, { message: 'aufgabe_id existiert nicht' })

      await expect(
        createChecklistenItem(mock.client as any, {
          organizationId: ORG,
          aufgabeId: 'ungueltig',
          titel: 'Test',
          position: 1,
        }),
      ).rejects.toThrow('Checklistenpunkt konnte nicht erstellt werden')
    })
  })

  // ── updateChecklistenItem ─────────────────────────────────────

  describe('updateChecklistenItem', () => {
    it('setzt erledigt auf true', async () => {
      const erledigt = checkItem({
        erledigt: true,
        erledigt_von: 'u-1',
        erledigt_am: '2026-08-08T14:30:00Z',
      })
      mock._setResult(erledigt)

      const ergebnis = await updateChecklistenItem(mock.client as any, {
        organizationId: ORG,
        id: 'ch-1',
        data: {
          erledigt: true,
          erledigt_von: 'u-1',
          erledigt_am: '2026-08-08T14:30:00Z',
        },
      })

      expect(ergebnis.erledigt).toBe(true)
      expect(ergebnis.erledigt_von).toBe('u-1')
      expect(mock.queryBuilder.update).toHaveBeenCalled()
    })

    it('setzt erledigt zurueck auf false', async () => {
      const zurueck = checkItem({ erledigt: false, erledigt_von: null, erledigt_am: null })
      mock._setResult(zurueck)

      const ergebnis = await updateChecklistenItem(mock.client as any, {
        organizationId: ORG,
        id: 'ch-1',
        data: { erledigt: false, erledigt_von: null, erledigt_am: null },
      })

      expect(ergebnis.erledigt).toBe(false)
      expect(ergebnis.erledigt_von).toBeNull()
    })

    it('wirft Fehler wenn Punkt nicht gefunden', async () => {
      mock._setResult(null, { message: 'Nicht gefunden' })

      await expect(
        updateChecklistenItem(mock.client as any, {
          organizationId: ORG,
          id: 'nicht-vorhanden',
          data: { erledigt: true },
        }),
      ).rejects.toThrow('Checklistenpunkt konnte nicht aktualisiert werden')
    })
  })

  // ── Fortschrittsberechnung ────────────────────────────────────

  describe('Fortschrittsberechnung', () => {
    it('berechnet Fortschritt korrekt aus erledigten Items', async () => {
      const items = [
        checkItem({ id: 'ch-1', erledigt: true }),
        checkItem({ id: 'ch-2', erledigt: true }),
        checkItem({ id: 'ch-3', erledigt: false }),
        checkItem({ id: 'ch-4', erledigt: false }),
      ]
      mock._setResult(items)

      const ergebnis = await listChecklisten(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
      })

      const total = ergebnis.length
      const erledigt = ergebnis.filter((i) => i.erledigt).length
      const fortschritt = total > 0 ? Math.round((erledigt / total) * 100) : 0

      expect(total).toBe(4)
      expect(erledigt).toBe(2)
      expect(fortschritt).toBe(50)
    })

    it('liefert 100% bei allen erledigten Items', async () => {
      const items = [
        checkItem({ id: 'ch-1', erledigt: true }),
        checkItem({ id: 'ch-2', erledigt: true }),
      ]
      mock._setResult(items)

      const ergebnis = await listChecklisten(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
      })

      const erledigt = ergebnis.filter((i) => i.erledigt).length
      expect(erledigt).toBe(ergebnis.length)
    })

    it('liefert 0% bei keinen erledigten Items', async () => {
      const items = [
        checkItem({ id: 'ch-1', erledigt: false }),
        checkItem({ id: 'ch-2', erledigt: false }),
      ]
      mock._setResult(items)

      const ergebnis = await listChecklisten(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
      })

      const erledigt = ergebnis.filter((i) => i.erledigt).length
      expect(erledigt).toBe(0)
    })
  })

  // ── deleteChecklistenItem ─────────────────────────────────────

  describe('deleteChecklistenItem', () => {
    it('loescht einen Checklistenpunkt', async () => {
      mock._setResult(null)

      await expect(
        deleteChecklistenItem(mock.client as any, { organizationId: ORG, id: 'ch-1' }),
      ).resolves.toBeUndefined()

      expect(mock.queryBuilder.delete).toHaveBeenCalled()
    })
  })
})
