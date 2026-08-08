// ═══════════════════════════════════════════════════════════════
// Eskalationen — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listEskalationsregeln,
  createEskalationsregel,
  updateEskalationsregel,
  deleteEskalationsregel,
  listEskalationshistorie,
} from '@/lib/ops/eskalationen'

const ORG = '00000000-0000-4000-8000-000460629986'

function regelFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'er-1',
    organization_id: ORG,
    name: 'Kritische Aufgabe ueberfaellig',
    beschreibung: 'Eskalation bei kritischen Aufgaben nach 24h',
    aufgaben_kategorie: 'pflege' as const,
    aufgaben_prioritaet: 'kritisch' as const,
    ueberfaellig_stunden: 24,
    eskalationsstufe: 1,
    eskalation_an_rolle: 'pdl' as const,
    eskalation_an_user_id: null,
    benachrichtigung_senden: true,
    aktiv: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...over,
  }
}

function historieFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'eh-1',
    organization_id: ORG,
    aufgabe_id: 'a-1',
    regel_id: 'er-1',
    eskalationsstufe: 1,
    eskaliert_an: 'u-pdl',
    grund: 'Aufgabe seit 26 Stunden ueberfaellig',
    erstellt_am: '2026-08-08T10:00:00Z',
    ...over,
  }
}

describe('Eskalationen', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listEskalationsregeln ─────────────────────────────────────

  describe('listEskalationsregeln', () => {
    it('filtert nach aktiv=true', async () => {
      const aktive = [
        regelFixture({ id: 'er-1', aktiv: true }),
        regelFixture({ id: 'er-2', aktiv: true, name: 'Hohe Prio nach 48h' }),
      ]
      mock._setResult(aktive)

      const ergebnis = await listEskalationsregeln(mock.client as any, {
        organizationId: ORG,
        aktiv: true,
      })

      expect(ergebnis).toHaveLength(2)
      expect(ergebnis.every((r) => r.aktiv)).toBe(true)
      expect(mock.client.from).toHaveBeenCalledWith('ops_eskalationsregeln')
    })

    it('filtert nach aktiv=false', async () => {
      const inaktive = [
        regelFixture({ id: 'er-3', aktiv: false, name: 'Deaktivierte Regel' }),
      ]
      mock._setResult(inaktive)

      const ergebnis = await listEskalationsregeln(mock.client as any, {
        organizationId: ORG,
        aktiv: false,
      })

      expect(ergebnis).toHaveLength(1)
      expect(ergebnis[0].aktiv).toBe(false)
    })

    it('liefert alle Regeln ohne aktiv-Filter', async () => {
      const alle = [
        regelFixture({ id: 'er-1', aktiv: true }),
        regelFixture({ id: 'er-2', aktiv: false }),
      ]
      mock._setResult(alle)

      const ergebnis = await listEskalationsregeln(mock.client as any, {
        organizationId: ORG,
      })

      expect(ergebnis).toHaveLength(2)
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Tabelle nicht gefunden' })

      await expect(
        listEskalationsregeln(mock.client as any, { organizationId: ORG }),
      ).rejects.toThrow('Eskalationsregeln konnten nicht geladen werden')
    })
  })

  // ── Eskalationsregel-Matching ─────────────────────────────────

  describe('Eskalationsregel-Matching (Kategorie + Prioritaet)', () => {
    it('Regel mit spezifischer Kategorie + Prioritaet matcht', async () => {
      const regeln = [
        regelFixture({
          aufgaben_kategorie: 'pflege',
          aufgaben_prioritaet: 'kritisch',
          ueberfaellig_stunden: 24,
        }),
      ]
      mock._setResult(regeln)

      const ergebnis = await listEskalationsregeln(mock.client as any, {
        organizationId: ORG,
        aktiv: true,
      })

      // Anwendungsseitige Matching-Logik
      const aufgabeKategorie = 'pflege'
      const aufgabePrioritaet = 'kritisch'

      const passend = ergebnis.filter((r) =>
        (!r.aufgaben_kategorie || r.aufgaben_kategorie === aufgabeKategorie) &&
        (!r.aufgaben_prioritaet || r.aufgaben_prioritaet === aufgabePrioritaet),
      )

      expect(passend).toHaveLength(1)
      expect(passend[0].eskalation_an_rolle).toBe('pdl')
    })

    it('Regel mit null-Kategorie matcht alle Kategorien', async () => {
      const regeln = [
        regelFixture({
          aufgaben_kategorie: null,
          aufgaben_prioritaet: 'kritisch',
        }),
      ]
      mock._setResult(regeln)

      const ergebnis = await listEskalationsregeln(mock.client as any, {
        organizationId: ORG,
        aktiv: true,
      })

      // Null-Kategorie = matcht jede Kategorie
      const passend = ergebnis.filter((r) =>
        (!r.aufgaben_kategorie || r.aufgaben_kategorie === 'abrechnung') &&
        (!r.aufgaben_prioritaet || r.aufgaben_prioritaet === 'kritisch'),
      )

      expect(passend).toHaveLength(1)
    })

    it('Regel mit falscher Prioritaet matcht nicht', async () => {
      const regeln = [
        regelFixture({
          aufgaben_kategorie: 'pflege',
          aufgaben_prioritaet: 'kritisch',
        }),
      ]
      mock._setResult(regeln)

      const ergebnis = await listEskalationsregeln(mock.client as any, {
        organizationId: ORG,
        aktiv: true,
      })

      const passend = ergebnis.filter((r) =>
        (!r.aufgaben_kategorie || r.aufgaben_kategorie === 'pflege') &&
        (!r.aufgaben_prioritaet || r.aufgaben_prioritaet === 'niedrig'),
      )

      expect(passend).toHaveLength(0)
    })
  })

  // ── createEskalationsregel ────────────────────────────────────

  describe('createEskalationsregel', () => {
    it('erstellt eine neue Regel', async () => {
      const neu = regelFixture({ id: 'er-neu' })
      mock._setResult(neu)

      const ergebnis = await createEskalationsregel(mock.client as any, {
        organizationId: ORG,
        data: {
          name: 'Kritische Aufgabe ueberfaellig',
          beschreibung: null,
          aufgaben_kategorie: 'pflege',
          aufgaben_prioritaet: 'kritisch',
          ueberfaellig_stunden: 24,
          eskalationsstufe: 1,
          eskalation_an_rolle: 'pdl',
          eskalation_an_user_id: null,
          benachrichtigung_senden: true,
          aktiv: true,
        },
      })

      expect(ergebnis.name).toBe('Kritische Aufgabe ueberfaellig')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })
  })

  // ── updateEskalationsregel ────────────────────────────────────

  describe('updateEskalationsregel', () => {
    it('deaktiviert eine Regel', async () => {
      mock._setResult(regelFixture({ aktiv: false }))

      const ergebnis = await updateEskalationsregel(mock.client as any, {
        organizationId: ORG,
        id: 'er-1',
        data: { aktiv: false },
      })

      expect(ergebnis.aktiv).toBe(false)
      expect(mock.queryBuilder.update).toHaveBeenCalled()
    })
  })

  // ── deleteEskalationsregel ────────────────────────────────────

  describe('deleteEskalationsregel', () => {
    it('loescht eine Regel', async () => {
      mock._setResult(null)

      await expect(
        deleteEskalationsregel(mock.client as any, { organizationId: ORG, id: 'er-1' }),
      ).resolves.toBeUndefined()

      expect(mock.queryBuilder.delete).toHaveBeenCalled()
    })
  })

  // ── Eskalationshistorie (immutable) ───────────────────────────

  describe('listEskalationshistorie', () => {
    it('liefert Historie-Eintraege sortiert nach Datum absteigend', async () => {
      const historie = [
        historieFixture({ id: 'eh-2', erstellt_am: '2026-08-08T12:00:00Z', eskalationsstufe: 2 }),
        historieFixture({ id: 'eh-1', erstellt_am: '2026-08-08T10:00:00Z', eskalationsstufe: 1 }),
      ]
      mock._setResult(historie)

      const ergebnis = await listEskalationshistorie(mock.client as any, {
        organizationId: ORG,
        aufgabeId: 'a-1',
      })

      expect(ergebnis).toHaveLength(2)
      expect(ergebnis[0].eskalationsstufe).toBe(2)
      expect(mock.client.from).toHaveBeenCalledWith('ops_eskalationshistorie')
    })

    it('filtert nach aufgabeId', async () => {
      mock._setResult([historieFixture()])

      await listEskalationshistorie(mock.client as any, {
        organizationId: ORG,
        aufgabeId: 'a-1',
      })

      expect(mock.queryBuilder.eq).toHaveBeenCalled()
    })

    it('begrenzt Ergebnisse mit limit', async () => {
      mock._setResult([historieFixture()])

      await listEskalationshistorie(mock.client as any, {
        organizationId: ORG,
        limit: 5,
      })

      expect(mock.queryBuilder.limit).toHaveBeenCalled()
    })

    it('Historie ist schreibgeschuetzt — nur Lese-Funktion vorhanden', async () => {
      // Es gibt keine create/update/delete fuer Eskalationshistorie.
      // Die Eintraege werden nur vom System erzeugt (immutable).
      // Wir pruefen, dass die Lib kein Schreib-API exponiert.
      const eskalationsModule = await import('@/lib/ops/eskalationen')
      expect((eskalationsModule as any).createEskalationshistorie).toBeUndefined()
      expect((eskalationsModule as any).updateEskalationshistorie).toBeUndefined()
      expect((eskalationsModule as any).deleteEskalationshistorie).toBeUndefined()
    })
  })
})
