// ═══════════════════════════════════════════════════════════════
// Benachrichtigungen — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listBenachrichtigungen,
  getZaehler,
  markBenachrichtigungenGelesen,
  createBenachrichtigung,
} from '@/lib/ops/benachrichtigungen'

const ORG = '00000000-0000-4000-8000-000460629986'
const USER_ID = 'u-1'

function benachrichtigungFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'bn-1',
    organization_id: ORG,
    empfaenger_id: USER_ID,
    titel: 'Neue Aufgabe zugewiesen',
    inhalt: 'Ihnen wurde die Aufgabe "Pflegebericht" zugewiesen.',
    typ: 'info' as const,
    kategorie: 'aufgabe' as const,
    bezug_typ: 'aufgabe' as const,
    bezug_id: 'a-1',
    link: '/admin/ops/aufgaben/a-1',
    gelesen: false,
    gelesen_am: null,
    email_gesendet: false,
    push_gesendet: false,
    created_at: '2026-08-08T10:00:00Z',
    ...over,
  }
}

describe('Benachrichtigungen', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listBenachrichtigungen ────────────────────────────────────

  describe('listBenachrichtigungen', () => {
    it('filtert nach gelesen=false (ungelesene)', async () => {
      const ungelesene = [
        benachrichtigungFixture({ id: 'bn-1', gelesen: false }),
        benachrichtigungFixture({ id: 'bn-2', gelesen: false }),
      ]
      mock._setResult(ungelesene)

      const ergebnis = await listBenachrichtigungen(mock.client as any, {
        organizationId: ORG,
        empfaengerId: USER_ID,
        gelesen: false,
      })

      expect(ergebnis).toHaveLength(2)
      expect(ergebnis.every((b) => !b.gelesen)).toBe(true)
    })

    it('filtert nach Kategorie', async () => {
      const aufgaben = [
        benachrichtigungFixture({ id: 'bn-1', kategorie: 'aufgabe' }),
      ]
      mock._setResult(aufgaben)

      const ergebnis = await listBenachrichtigungen(mock.client as any, {
        organizationId: ORG,
        empfaengerId: USER_ID,
        kategorie: 'aufgabe',
      })

      expect(ergebnis).toHaveLength(1)
      expect(ergebnis[0].kategorie).toBe('aufgabe')
    })

    it('begrenzt Ergebnisse mit limit', async () => {
      mock._setResult([benachrichtigungFixture()])

      await listBenachrichtigungen(mock.client as any, {
        organizationId: ORG,
        empfaengerId: USER_ID,
        limit: 10,
      })

      expect(mock.queryBuilder.limit).toHaveBeenCalled()
    })

    it('liefert alle ohne optionale Filter', async () => {
      const alle = [
        benachrichtigungFixture({ id: 'bn-1', gelesen: false }),
        benachrichtigungFixture({ id: 'bn-2', gelesen: true }),
      ]
      mock._setResult(alle)

      const ergebnis = await listBenachrichtigungen(mock.client as any, {
        organizationId: ORG,
        empfaengerId: USER_ID,
      })

      expect(ergebnis).toHaveLength(2)
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Verbindung verloren' })

      await expect(
        listBenachrichtigungen(mock.client as any, {
          organizationId: ORG,
          empfaengerId: USER_ID,
        }),
      ).rejects.toThrow('Benachrichtigungen konnten nicht geladen werden')
    })
  })

  // ── getZaehler ────────────────────────────────────────────────

  describe('getZaehler', () => {
    it('aggregiert ungelesene Zaehler pro Kategorie', async () => {
      const zaehler = [
        { empfaenger_id: USER_ID, kategorie: 'aufgabe', ungelesen: 5 },
        { empfaenger_id: USER_ID, kategorie: 'einsatz', ungelesen: 2 },
        { empfaenger_id: USER_ID, kategorie: 'pflege', ungelesen: 0 },
      ]
      mock._setResult(zaehler)

      const ergebnis = await getZaehler(mock.client as any, {
        organizationId: ORG,
        empfaengerId: USER_ID,
      })

      expect(ergebnis).toHaveLength(3)
      expect(mock.client.from).toHaveBeenCalledWith('ops_benachrichtigungen_zaehler')

      const aufgabenZaehler = ergebnis.find((z) => z.kategorie === 'aufgabe')
      expect(aufgabenZaehler?.ungelesen).toBe(5)

      const gesamtUngelesen = ergebnis.reduce((sum, z) => sum + z.ungelesen, 0)
      expect(gesamtUngelesen).toBe(7)
    })

    it('liefert leeres Array bei keinen Benachrichtigungen', async () => {
      mock._setResult([])

      const ergebnis = await getZaehler(mock.client as any, {
        organizationId: ORG,
        empfaengerId: USER_ID,
      })

      expect(ergebnis).toEqual([])
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'View nicht gefunden' })

      await expect(
        getZaehler(mock.client as any, { organizationId: ORG, empfaengerId: USER_ID }),
      ).rejects.toThrow('Benachrichtigungszaehler konnte nicht geladen werden')
    })
  })

  // ── markBenachrichtigungenGelesen ─────────────────────────────

  describe('markBenachrichtigungenGelesen', () => {
    it('markiert mehrere Benachrichtigungen als gelesen', async () => {
      mock._setResult(null) // update gibt void zurueck

      await expect(
        markBenachrichtigungenGelesen(mock.client as any, {
          organizationId: ORG,
          ids: ['bn-1', 'bn-2', 'bn-3'],
          empfaengerId: USER_ID,
        }),
      ).resolves.toBeUndefined()

      expect(mock.queryBuilder.update).toHaveBeenCalled()
      expect(mock.queryBuilder.in).toHaveBeenCalled()
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Update fehlgeschlagen' })

      await expect(
        markBenachrichtigungenGelesen(mock.client as any, {
          organizationId: ORG,
          ids: ['bn-1'],
          empfaengerId: USER_ID,
        }),
      ).rejects.toThrow('Benachrichtigungen konnten nicht als gelesen markiert werden')
    })
  })

  // ── createBenachrichtigung ────────────────────────────────────

  describe('createBenachrichtigung', () => {
    it('erstellt eine neue Benachrichtigung', async () => {
      const neu = benachrichtigungFixture({ id: 'bn-neu' })
      mock._setResult(neu)

      const ergebnis = await createBenachrichtigung(mock.client as any, {
        organizationId: ORG,
        data: {
          empfaenger_id: USER_ID,
          titel: 'Neue Aufgabe',
          inhalt: 'Eine Aufgabe wurde erstellt.',
          typ: 'info',
          kategorie: 'aufgabe',
          bezug_typ: 'aufgabe',
          bezug_id: 'a-1',
          link: '/admin/ops/aufgaben/a-1',
          email_gesendet: false,
          push_gesendet: false,
        },
      })

      expect(ergebnis.titel).toBe('Neue Aufgabe zugewiesen')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })
  })
})
