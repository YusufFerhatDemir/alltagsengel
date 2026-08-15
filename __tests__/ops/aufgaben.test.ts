// ═══════════════════════════════════════════════════════════════
// Aufgaben CRUD — Unit-Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach } from 'vitest'
import { createMockSupabase } from './_supabase-mock'
import {
  listAufgaben,
  getAufgabe,
  createAufgabe,
  updateAufgabe,
  deleteAufgabe,
} from '@/lib/ops/aufgaben'

const ORG = '00000000-0000-4000-8000-000460629986'

const aufgabeFixture = {
  id: 'a-1',
  organization_id: ORG,
  titel: 'Pflegebericht pruefen',
  beschreibung: null,
  kategorie: 'pflege' as const,
  prioritaet: 'hoch' as const,
  status: 'offen' as const,
  verantwortlich_id: 'u-1',
  stellvertreter_id: null,
  erstellt_von: 'u-2',
  faellig_am: '2026-08-10',
  erledigt_am: null,
  erledigt_von: null,
  client_id: 'c-1',
  caregiver_id: 'cg-1',
  assignment_id: null,
  dokument_id: null,
  verordnung_id: null,
  abrechnungslauf_id: null,
  pflege_aufnahme_id: null,
  dienstplan_eintrag_id: null,
  ist_wiederkehrend: false,
  wiederholung_intervall: null,
  wiederholung_naechstes: null,
  wiederholung_ende: null,
  wiederholung_vorlage_id: null,
  eskalationsstufe: 0,
  eskaliert_am: null,
  eskaliert_an: null,
  tags: ['dringend'],
  metadata: null,
  created_at: '2026-08-08T10:00:00Z',
  updated_at: '2026-08-08T10:00:00Z',
}

const uebersichtFixture = {
  ...aufgabeFixture,
  verantwortlich_name: 'Anna Mueller',
  stellvertreter_name: null,
  erstellt_von_name: 'Max Mustermann',
  client_name: 'Erika Muster',
  caregiver_name: 'Anna Mueller',
  faelligkeits_status: 'diese_woche' as const,
  checklisten_total: 3,
  checklisten_erledigt: 1,
  kommentare_anzahl: 2,
}

describe('Aufgaben', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()
  })

  // ── listAufgaben ──────────────────────────────────────────────

  describe('listAufgaben', () => {
    it('liefert gefilterte Ergebnisse zurueck', async () => {
      mock._setResult([uebersichtFixture])

      const ergebnis = await listAufgaben(mock.client as any, {
        organizationId: ORG,
        status: 'offen',
      })

      expect(ergebnis).toHaveLength(1)
      expect(ergebnis[0].titel).toBe('Pflegebericht pruefen')
      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben_uebersicht')
    })

    it('gibt leeres Array bei keinen Treffern zurueck', async () => {
      mock._setResult([])

      const ergebnis = await listAufgaben(mock.client as any, {
        organizationId: ORG,
      })

      expect(ergebnis).toEqual([])
    })

    it('wirft Fehler bei Datenbankproblem', async () => {
      mock._setResult(null, { message: 'Verbindungsfehler' })

      await expect(
        listAufgaben(mock.client as any, { organizationId: ORG }),
      ).rejects.toThrow('Aufgaben konnten nicht geladen werden')
    })

    it('wendet Suchfilter an', async () => {
      mock._setResult([uebersichtFixture])

      await listAufgaben(mock.client as any, {
        organizationId: ORG,
        search: 'Pflege',
        kategorie: 'pflege',
        prioritaet: 'hoch',
        verantwortlichId: 'u-1',
        limit: 10,
        offset: 0,
      })

      // Pruefen, dass alle Filter-Methoden aufgerufen wurden
      expect(mock.queryBuilder.eq).toHaveBeenCalled()
      expect(mock.queryBuilder.ilike).toHaveBeenCalled()
      expect(mock.queryBuilder.limit).toHaveBeenCalled()
    })
  })

  // ── getAufgabe ────────────────────────────────────────────────

  describe('getAufgabe', () => {
    it('liefert Aufgabe mit ID zurueck', async () => {
      mock._setResult(uebersichtFixture)

      const ergebnis = await getAufgabe(mock.client as any, {
        organizationId: ORG,
        id: 'a-1',
      })

      expect(ergebnis).not.toBeNull()
      expect(ergebnis?.id).toBe('a-1')
    })

    it('liefert null bei unbekannter ID', async () => {
      mock._setResult(null)

      const ergebnis = await getAufgabe(mock.client as any, {
        organizationId: ORG,
        id: 'nicht-vorhanden',
      })

      expect(ergebnis).toBeNull()
    })
  })

  // ── createAufgabe ─────────────────────────────────────────────

  describe('createAufgabe', () => {
    it('erstellt eine neue Aufgabe', async () => {
      mock._setResult(aufgabeFixture)

      const ergebnis = await createAufgabe(mock.client as any, {
        organizationId: ORG,
        data: {
          titel: 'Pflegebericht pruefen',
          kategorie: 'pflege',
          prioritaet: 'hoch',
          status: 'offen',
        },
      })

      expect(ergebnis.titel).toBe('Pflegebericht pruefen')
      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben')
      expect(mock.queryBuilder.insert).toHaveBeenCalled()
    })

    it('uebergibt Entity-Links (client_id, caregiver_id)', async () => {
      const mitLinks = {
        ...aufgabeFixture,
        client_id: 'c-99',
        caregiver_id: 'cg-42',
        assignment_id: 'asg-7',
      }
      mock._setResult(mitLinks)

      const ergebnis = await createAufgabe(mock.client as any, {
        organizationId: ORG,
        data: {
          titel: 'Einsatz pruefen',
          kategorie: 'einsatz',
          prioritaet: 'mittel',
          status: 'offen',
          client_id: 'c-99',
          caregiver_id: 'cg-42',
          assignment_id: 'asg-7',
        },
      })

      expect(ergebnis.client_id).toBe('c-99')
      expect(ergebnis.caregiver_id).toBe('cg-42')
      expect(ergebnis.assignment_id).toBe('asg-7')
    })

    it('wirft Fehler bei fehlgeschlagenem Insert', async () => {
      mock._setResult(null, { message: 'Constraint-Verletzung' })

      await expect(
        createAufgabe(mock.client as any, {
          organizationId: ORG,
          data: { titel: 'Test', kategorie: 'allgemein', prioritaet: 'niedrig', status: 'offen' },
        }),
      ).rejects.toThrow('Aufgabe konnte nicht erstellt werden')
    })
  })

  // ── updateAufgabe ─────────────────────────────────────────────

  describe('updateAufgabe', () => {
    it('aendert den Status einer Aufgabe', async () => {
      const aktualisiert = { ...aufgabeFixture, status: 'erledigt', erledigt_am: '2026-08-08T14:00:00Z' }
      mock._setResult(aktualisiert)

      const ergebnis = await updateAufgabe(mock.client as any, {
        organizationId: ORG,
        id: 'a-1',
        data: { status: 'erledigt', erledigt_am: '2026-08-08T14:00:00Z' },
      })

      expect(ergebnis.status).toBe('erledigt')
      expect(ergebnis.erledigt_am).toBe('2026-08-08T14:00:00Z')
      expect(mock.queryBuilder.update).toHaveBeenCalled()
    })

    it('wirft Fehler bei nicht gefundener Aufgabe', async () => {
      mock._setResult(null, { message: 'Nicht gefunden' })

      await expect(
        updateAufgabe(mock.client as any, {
          organizationId: ORG,
          id: 'nicht-vorhanden',
          data: { status: 'erledigt' },
        }),
      ).rejects.toThrow('Aufgabe konnte nicht aktualisiert werden')
    })
  })

  // ── deleteAufgabe ─────────────────────────────────────────────

  describe('deleteAufgabe', () => {
    it('archiviert eine Aufgabe per Soft-Delete', async () => {
      mock._setResult(null)

      await expect(
        deleteAufgabe(mock.client as any, { organizationId: ORG, id: 'a-1' }),
      ).resolves.toBeUndefined()

      expect(mock.client.from).toHaveBeenCalledWith('ops_aufgaben')
      expect(mock.queryBuilder.update).toHaveBeenCalled()
    })

    it('wirft Fehler bei DB-Problem', async () => {
      mock._setResult(null, { message: 'FK-Verletzung' })

      await expect(
        deleteAufgabe(mock.client as any, { organizationId: ORG, id: 'a-1' }),
      ).rejects.toThrow('Aufgabe konnte nicht archiviert werden')
    })
  })
})
