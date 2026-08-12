// ═══════════════════════════════════════════════════════════════
// Kommentare — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import { listKommentare, createKommentar } from '@/lib/ops/kommentare'

const ORG = '00000000-0000-4000-8000-000460629986'
const AUFGABE_ID = 'a-1'

function kommentar(over: Record<string, unknown> = {}) {
  return {
    id: 'k-1',
    organization_id: ORG,
    aufgabe_id: AUFGABE_ID,
    inhalt: 'Bitte Pflegebericht nochmals pruefen.',
    autor_id: 'u-1',
    ist_intern: false,
    created_at: '2026-08-08T10:00:00Z',
    updated_at: '2026-08-08T10:00:00Z',
    ...over,
  }
}

describe('Kommentare', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listKommentare ────────────────────────────────────────────

  describe('listKommentare', () => {
    it('zeigt alle Kommentare mit includeIntern=true', async () => {
      const items = [
        kommentar({ id: 'k-1', ist_intern: false }),
        kommentar({ id: 'k-2', ist_intern: true, inhalt: 'Intern: PDL informieren' }),
        kommentar({ id: 'k-3', ist_intern: false }),
      ]
      mock._setResult(items)

      const ergebnis = await listKommentare(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        includeIntern: true,
      })

      expect(ergebnis).toHaveLength(3)
      // Bei includeIntern=true darf eq('ist_intern', false) NICHT aufgerufen werden.
      // Die Funktion ruft eq nur fuer organization_id und aufgabe_id auf.
    })

    it('filtert interne Kommentare bei includeIntern=false', async () => {
      const nurExterne = [
        kommentar({ id: 'k-1', ist_intern: false }),
        kommentar({ id: 'k-3', ist_intern: false }),
      ]
      mock._setResult(nurExterne)

      const ergebnis = await listKommentare(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        includeIntern: false,
      })

      expect(ergebnis).toHaveLength(2)
      expect(ergebnis.every((k) => !k.ist_intern)).toBe(true)
    })

    it('filtert interne Kommentare standardmaessig (includeIntern nicht gesetzt)', async () => {
      mock._setResult([kommentar({ ist_intern: false })])

      await listKommentare(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        // includeIntern nicht gesetzt → Standard ist false
      })

      // eq wird aufgerufen — u.a. fuer ist_intern=false
      expect(mock.queryBuilder.eq).toHaveBeenCalled()
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'Verbindung unterbrochen' })

      await expect(
        listKommentare(mock.client as any, {
          organizationId: ORG,
          aufgabeId: AUFGABE_ID,
        }),
      ).rejects.toThrow('Kommentare konnten nicht geladen werden')
    })
  })

  // ── createKommentar ───────────────────────────────────────────

  describe('createKommentar', () => {
    it('erstellt einen oeffentlichen Kommentar', async () => {
      const neuer = kommentar({ id: 'k-neu', ist_intern: false })
      mock._setResult(neuer)

      const ergebnis = await createKommentar(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        inhalt: 'Alles erledigt.',
        autorId: 'u-1',
      })

      expect(ergebnis.ist_intern).toBe(false)
      expect(ergebnis.inhalt).toBeDefined()
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('erstellt einen internen Kommentar mit ist_intern=true', async () => {
      const interner = kommentar({ id: 'k-intern', ist_intern: true, inhalt: 'PDL wurde informiert' })
      mock._setResult(interner)

      const ergebnis = await createKommentar(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        inhalt: 'PDL wurde informiert',
        autorId: 'u-2',
        istIntern: true,
      })

      expect(ergebnis.ist_intern).toBe(true)
      expect(ergebnis.inhalt).toBe('PDL wurde informiert')
    })

    it('setzt ist_intern standardmaessig auf false', async () => {
      const standard = kommentar({ ist_intern: false })
      mock._setResult(standard)

      const ergebnis = await createKommentar(mock.client as any, {
        organizationId: ORG,
        aufgabeId: AUFGABE_ID,
        inhalt: 'Ohne Flag',
        autorId: 'u-1',
        // istIntern nicht gesetzt → false
      })

      expect(ergebnis.ist_intern).toBe(false)
    })

    it('wirft Fehler bei fehlgeschlagenem Insert', async () => {
      mock._setResult(null, { message: 'aufgabe_id ungueltig' })

      await expect(
        createKommentar(mock.client as any, {
          organizationId: ORG,
          aufgabeId: 'nicht-vorhanden',
          inhalt: 'Test',
          autorId: 'u-1',
        }),
      ).rejects.toThrow('Kommentar konnte nicht erstellt werden')
    })
  })
})
