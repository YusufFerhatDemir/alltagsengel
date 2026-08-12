// ═══════════════════════════════════════════════════════════════
// Wiedervorlagen — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listWiedervorlagen,
  listFaelligeWiedervorlagen,
  createWiedervorlage,
  updateWiedervorlage,
} from '@/lib/ops/wiedervorlagen'

const ORG = '00000000-0000-4000-8000-000460629986'

function wvFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'wv-1',
    organization_id: ORG,
    titel: 'Verordnung nachfragen',
    beschreibung: 'Arzt hat noch nicht geantwortet',
    entitaet_typ: 'verordnung' as const,
    entitaet_id: 'vo-1',
    faellig_am: '2026-08-10',
    empfaenger_id: 'u-1',
    status: 'aktiv' as const,
    erledigt_am: null,
    erledigt_von: null,
    erstellt_von: 'u-2',
    created_at: '2026-08-08T10:00:00Z',
    // View-Felder
    empfaenger_name: 'Anna Mueller',
    erstellt_von_name: 'Max Mustermann',
    dringlichkeit: 'diese_woche' as const,
    ...over,
  }
}

describe('Wiedervorlagen', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listWiedervorlagen ────────────────────────────────────────

  describe('listWiedervorlagen', () => {
    it('filtert nach Status', async () => {
      const aktive = [
        wvFixture({ id: 'wv-1', status: 'aktiv' }),
        wvFixture({ id: 'wv-2', status: 'aktiv' }),
      ]
      mock._setResult(aktive)

      const ergebnis = await listWiedervorlagen(mock.client as any, {
        organizationId: ORG,
        status: 'aktiv',
      })

      expect(ergebnis).toHaveLength(2)
      expect(ergebnis.every((w) => w.status === 'aktiv')).toBe(true)
      expect(mock.client.from).toHaveBeenCalledWith('ops_wiedervorlagen_faellig')
    })

    it('filtert nach Empfaenger', async () => {
      mock._setResult([wvFixture({ empfaenger_id: 'u-1' })])

      const ergebnis = await listWiedervorlagen(mock.client as any, {
        organizationId: ORG,
        empfaengerId: 'u-1',
      })

      expect(ergebnis).toHaveLength(1)
      expect(mock.queryBuilder.eq).toHaveBeenCalled()
    })

    it('liefert leeres Array ohne Treffer', async () => {
      mock._setResult([])

      const ergebnis = await listWiedervorlagen(mock.client as any, {
        organizationId: ORG,
        status: 'storniert',
      })

      expect(ergebnis).toEqual([])
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Timeout' })

      await expect(
        listWiedervorlagen(mock.client as any, { organizationId: ORG }),
      ).rejects.toThrow('Wiedervorlagen konnten nicht geladen werden')
    })
  })

  // ── listFaelligeWiedervorlagen (Dringlichkeit-View) ───────────

  describe('listFaelligeWiedervorlagen', () => {
    it('liefert ueberfaellige und heute faellige Wiedervorlagen', async () => {
      const faellige = [
        wvFixture({ id: 'wv-1', dringlichkeit: 'ueberfaellig', faellig_am: '2026-08-06' }),
        wvFixture({ id: 'wv-2', dringlichkeit: 'heute', faellig_am: '2026-08-08' }),
        wvFixture({ id: 'wv-3', dringlichkeit: 'morgen', faellig_am: '2026-08-09' }),
      ]
      mock._setResult(faellige)

      const ergebnis = await listFaelligeWiedervorlagen(mock.client as any, {
        organizationId: ORG,
      })

      expect(ergebnis).toHaveLength(3)
      // Pruefen, dass die View nur aktive + dringende liefert
      expect(mock.queryBuilder.eq).toHaveBeenCalled()
      expect(mock.queryBuilder.in).toHaveBeenCalled()
    })

    it('gibt leeres Array wenn nichts faellig', async () => {
      mock._setResult([])

      const ergebnis = await listFaelligeWiedervorlagen(mock.client as any, {
        organizationId: ORG,
      })

      expect(ergebnis).toEqual([])
    })
  })

  // ── createWiedervorlage ───────────────────────────────────────

  describe('createWiedervorlage', () => {
    it('erstellt eine neue Wiedervorlage', async () => {
      const neu = wvFixture({ id: 'wv-neu' })
      mock._setResult(neu)

      const ergebnis = await createWiedervorlage(mock.client as any, {
        organizationId: ORG,
        data: {
          titel: 'Verordnung nachfragen',
          beschreibung: null,
          entitaet_typ: 'verordnung',
          entitaet_id: 'vo-1',
          faellig_am: '2026-08-10',
          empfaenger_id: 'u-1',
          status: 'aktiv',
          erstellt_von: 'u-2',
        },
      })

      expect(ergebnis.titel).toBe('Verordnung nachfragen')
      expect(mock.client.from).toHaveBeenCalledWith('ops_wiedervorlagen')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('wirft Fehler bei ungueltigem entitaet_id', async () => {
      mock._setResult(null, { message: 'FK-Verletzung' })

      await expect(
        createWiedervorlage(mock.client as any, {
          organizationId: ORG,
          data: {
            titel: 'Test',
            beschreibung: null,
            entitaet_typ: 'aufgabe',
            entitaet_id: 'ungueltig',
            faellig_am: '2026-08-10',
            empfaenger_id: 'u-1',
            status: 'aktiv',
            erstellt_von: 'u-2',
          },
        }),
      ).rejects.toThrow('Wiedervorlage konnte nicht erstellt werden')
    })
  })

  // ── updateWiedervorlage (Status-Flow) ─────────────────────────

  describe('updateWiedervorlage', () => {
    it('setzt Status auf erledigt', async () => {
      const erledigt = wvFixture({
        status: 'erledigt',
        erledigt_am: '2026-08-08T14:00:00Z',
        erledigt_von: 'u-1',
      })
      mock._setResult(erledigt)

      const ergebnis = await updateWiedervorlage(mock.client as any, {
        organizationId: ORG,
        id: 'wv-1',
        data: {
          status: 'erledigt',
          erledigt_am: '2026-08-08T14:00:00Z',
          erledigt_von: 'u-1',
        },
      })

      expect(ergebnis.status).toBe('erledigt')
      expect(ergebnis.erledigt_am).toBeDefined()
      expect(ergebnis.erledigt_von).toBe('u-1')
    })

    it('setzt Status auf storniert', async () => {
      const storniert = wvFixture({ status: 'storniert' })
      mock._setResult(storniert)

      const ergebnis = await updateWiedervorlage(mock.client as any, {
        organizationId: ORG,
        id: 'wv-1',
        data: { status: 'storniert' },
      })

      expect(ergebnis.status).toBe('storniert')
    })

    it('verschiebt Faelligkeitsdatum', async () => {
      const verschoben = wvFixture({ faellig_am: '2026-08-15' })
      mock._setResult(verschoben)

      const ergebnis = await updateWiedervorlage(mock.client as any, {
        organizationId: ORG,
        id: 'wv-1',
        data: { faellig_am: '2026-08-15' },
      })

      expect(ergebnis.faellig_am).toBe('2026-08-15')
    })

    it('wirft Fehler bei nicht gefundener Wiedervorlage', async () => {
      mock._setResult(null, { message: 'Nicht gefunden' })

      await expect(
        updateWiedervorlage(mock.client as any, {
          organizationId: ORG,
          id: 'nicht-vorhanden',
          data: { status: 'erledigt' },
        }),
      ).rejects.toThrow('Wiedervorlage konnte nicht aktualisiert werden')
    })
  })
})
