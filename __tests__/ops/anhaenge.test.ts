// ═══════════════════════════════════════════════════════════════
// Anhaenge — Unit-Tests
// ═══════════════════════════════════════════════════════════════
//
// Schwerpunkt: Mandantentrennung bei createAnhang. `dokument_id` ist nur
// per einfacher FK an `akten_dokumente(id)` gebunden — ohne eine explizite
// Org-Pruefung liesse sich mit einer bekannten/erratenen fremden Dokument-ID
// ein Anhang anlegen, der auf ein Dokument einer ANDEREN Organisation zeigt
// (weder Composite-FK noch Trigger faengt das in der DB ab). createAnhang
// muss deshalb vor dem Insert per getDokument(..., organizationId) pruefen.

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import { listAnhaenge, createAnhang, deleteAnhang } from '@/lib/ops/anhaenge'

const ORG = '00000000-0000-4000-8000-000460629986'
const AUFGABE_ID = 'a-1'

function dokumentFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'd-1',
    organization_id: ORG,
    titel: 'Pflegebericht.pdf',
    deleted_at: null,
    ...over,
  }
}

function anhangFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'anh-1',
    organization_id: ORG,
    aufgabe_id: AUFGABE_ID,
    dokument_id: 'd-1',
    hinzugefuegt_von: 'u-1',
    created_at: '2026-08-08T10:00:00Z',
    ...over,
  }
}

describe('Anhaenge', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  describe('listAnhaenge', () => {
    it('liefert Anhaenge fuer eine Aufgabe', async () => {
      mock._setResult([anhangFixture()])

      const ergebnis = await listAnhaenge(mock.client as any, { organizationId: ORG, aufgabeId: AUFGABE_ID })

      expect(ergebnis).toHaveLength(1)
      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben_anhaenge')
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Verbindung unterbrochen' })

      await expect(
        listAnhaenge(mock.client as any, { organizationId: ORG, aufgabeId: AUFGABE_ID }),
      ).rejects.toThrow('Anhaenge konnten nicht geladen werden')
    })
  })

  describe('createAnhang — Mandantentrennung', () => {
    it('verweigert den Anhang, wenn das Dokument nicht gefunden wird oder einer anderen Organisation gehoert', async () => {
      // getDokument filtert per .eq('organization_id', organizationId) —
      // ein Dokument aus einer fremden Org liefert hier null.
      mock._setResult(null)

      await expect(
        createAnhang(mock.client as any, {
          organizationId: ORG,
          aufgabeId: AUFGABE_ID,
          dokumentId: 'd-fremde-org',
        }),
      ).rejects.toThrow('Dokument nicht gefunden oder gehoert nicht zur Organisation')

      // Der eigentliche Insert darf NIE erreicht werden, wenn die
      // Org-Pruefung fehlschlaegt — das ist der sicherheitsrelevante Teil.
      expect(mock.client.from).not.toHaveBeenCalledWith('ops_aufgaben_anhaenge')
      expect(mock.queryBuilder.insert).not.toHaveBeenCalled()
    })

    it('verweigert bei leerer Dokument-ID, ohne die DB zu befragen', async () => {
      await expect(
        createAnhang(mock.client as any, { organizationId: ORG, aufgabeId: AUFGABE_ID, dokumentId: '  ' }),
      ).rejects.toThrow('Dokument-ID ist ein Pflichtfeld')

      expect(mock.client.from).not.toHaveBeenCalled()
    })

    it('legt den Anhang an, wenn das Dokument zur eigenen Organisation gehoert', async () => {
      mock._setResult(dokumentFixture())

      const ergebnis = await createAnhang(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        dokumentId: 'd-1',
        hinzugefuegtVon: 'u-1',
      })

      expect(ergebnis).toBeDefined()
      expect(mock.client.from).toHaveBeenCalledWith('akten_dokumente')
      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben_anhaenge')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })
  })

  describe('deleteAnhang', () => {
    it('loescht organisationsscharf', async () => {
      mock._setResult(null)

      await expect(
        deleteAnhang(mock.client as any, { organizationId: ORG, id: 'anh-1' }),
      ).resolves.toBeUndefined()

      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben_anhaenge')
      expect(mock.queryBuilder.delete).toHaveBeenCalled()
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Nicht gefunden' })

      await expect(
        deleteAnhang(mock.client as any, { organizationId: ORG, id: 'anh-1' }),
      ).rejects.toThrow('Anhang konnte nicht geloescht werden')
    })
  })
})
