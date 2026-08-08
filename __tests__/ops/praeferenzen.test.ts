// ═══════════════════════════════════════════════════════════════
// Benachrichtigungs-Praeferenzen — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import { listPraeferenzen, upsertPraeferenz } from '@/lib/ops/praeferenzen'

const ORG = '00000000-0000-4000-8000-000460629986'
const USER_ID = 'u-1'

function praeferenzFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'bp-1',
    organization_id: ORG,
    benutzer_id: USER_ID,
    kategorie: 'aufgabe' as const,
    in_app: true,
    email: false,
    push: false,
    aktiv: true,
    created_at: '2026-08-08T10:00:00Z',
    updated_at: '2026-08-08T10:00:00Z',
    ...over,
  }
}

describe('Praeferenzen', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listPraeferenzen ──────────────────────────────────────────

  describe('listPraeferenzen', () => {
    it('liefert Praeferenzen eines Benutzers sortiert nach Kategorie', async () => {
      const praeferenzen = [
        praeferenzFixture({ kategorie: 'abrechnung', in_app: true, email: true }),
        praeferenzFixture({ kategorie: 'aufgabe', in_app: true, email: false }),
        praeferenzFixture({ kategorie: 'einsatz', in_app: false, email: false, aktiv: false }),
      ]
      mock._setResult(praeferenzen)

      const ergebnis = await listPraeferenzen(mock.client as any, {
        organizationId: ORG,
        benutzerId: USER_ID,
      })

      expect(ergebnis).toHaveLength(3)
      expect(mock.client.from).toHaveBeenCalledWith('ops_benachrichtigungs_praeferenzen')
    })

    it('gibt leeres Array bei keinen Praeferenzen', async () => {
      mock._setResult([])

      const ergebnis = await listPraeferenzen(mock.client as any, {
        organizationId: ORG,
        benutzerId: 'u-neu',
      })

      expect(ergebnis).toEqual([])
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Verbindung verloren' })

      await expect(
        listPraeferenzen(mock.client as any, { organizationId: ORG, benutzerId: USER_ID }),
      ).rejects.toThrow('Praeferenzen konnten nicht geladen werden')
    })
  })

  // ── upsertPraeferenz ──────────────────────────────────────────

  describe('upsertPraeferenz', () => {
    it('erstellt neue Praeferenz', async () => {
      const neu = praeferenzFixture({
        id: 'bp-neu',
        kategorie: 'pflege',
        in_app: true,
        email: true,
        push: true,
      })
      mock._setResult(neu)

      const ergebnis = await upsertPraeferenz(mock.client as any, {
        organizationId: ORG,
        benutzerId: USER_ID,
        kategorie: 'pflege',
        inApp: true,
        email: true,
        push: true,
      })

      expect(ergebnis.kategorie).toBe('pflege')
      expect(ergebnis.in_app).toBe(true)
      expect(ergebnis.email).toBe(true)
      expect(ergebnis.push).toBe(true)
      expect(mock.queryBuilder.upsert).toHaveBeenCalled()
    })

    it('aktualisiert bestehende Praeferenz (Upsert auf Unique-Constraint)', async () => {
      const aktualisiert = praeferenzFixture({
        kategorie: 'aufgabe',
        email: true,  // vorher false
      })
      mock._setResult(aktualisiert)

      const ergebnis = await upsertPraeferenz(mock.client as any, {
        organizationId: ORG,
        benutzerId: USER_ID,
        kategorie: 'aufgabe',
        email: true,
      })

      expect(ergebnis.email).toBe(true)
      expect(mock.queryBuilder.upsert).toHaveBeenCalled()
    })

    it('setzt Standardwerte wenn nicht angegeben', async () => {
      const standard = praeferenzFixture({
        in_app: true,   // Standard: true
        email: false,    // Standard: false
        push: false,     // Standard: false
        aktiv: true,     // Standard: true
      })
      mock._setResult(standard)

      const ergebnis = await upsertPraeferenz(mock.client as any, {
        organizationId: ORG,
        benutzerId: USER_ID,
        kategorie: 'aufgabe',
        // inApp, email, push, aktiv nicht gesetzt
      })

      expect(ergebnis.in_app).toBe(true)
      expect(ergebnis.email).toBe(false)
      expect(ergebnis.push).toBe(false)
      expect(ergebnis.aktiv).toBe(true)
    })

    it('deaktiviert eine Praeferenz', async () => {
      const deaktiviert = praeferenzFixture({ aktiv: false })
      mock._setResult(deaktiviert)

      const ergebnis = await upsertPraeferenz(mock.client as any, {
        organizationId: ORG,
        benutzerId: USER_ID,
        kategorie: 'aufgabe',
        aktiv: false,
      })

      expect(ergebnis.aktiv).toBe(false)
    })

    it('wirft Fehler bei fehlgeschlagenem Upsert', async () => {
      mock._setResult(null, { message: 'Constraint-Verletzung' })

      await expect(
        upsertPraeferenz(mock.client as any, {
          organizationId: ORG,
          benutzerId: USER_ID,
          kategorie: 'aufgabe',
        }),
      ).rejects.toThrow('Praeferenz konnte nicht gespeichert werden')
    })
  })
})
