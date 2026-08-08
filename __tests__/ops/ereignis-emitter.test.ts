// ═══════════════════════════════════════════════════════════════
// Ereignis-Emitter — Unit-Tests
// ═══════════════════════════════════════════════════════════════
// Testet die emitEreignis-Funktion, die:
//   1. Passende aktive Regeln laedt
//   2. Benachrichtigungen fuer Empfaenger erzeugt
//   3. Benutzer-Praeferenzen beruecksichtigt
//   4. Im Aktivitaetslog protokolliert
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emitEreignis } from '@/lib/ops/ereignis-emitter'

const ORG = '00000000-0000-4000-8000-000460629986'

// ── Differenzierter Supabase-Mock ───────────────────────────────
// emitEreignis macht mehrere sequenzielle Queries gegen verschiedene
// Tabellen. Dieser Mock unterscheidet nach Tabelle.

interface MockTableConfig {
  selectResult?: { data: any; error: any }
  insertResult?: { data: any; error: any }
  maybeSingleResult?: { data: any; error: any }
}

function createEmitterMock(tables: Record<string, MockTableConfig> = {}) {
  const callLog: { table: string; op: string }[] = []

  function buildChain(table: string, op: string) {
    const config = tables[table] ?? {}
    const result = op === 'insert'
      ? (config.insertResult ?? { data: null, error: null })
      : (config.selectResult ?? { data: [], error: null })

    const maybeSingleResult = config.maybeSingleResult ?? { data: null, error: null }

    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(() => Promise.resolve(result)),
      maybeSingle: vi.fn(() => Promise.resolve(maybeSingleResult)),
      then: (resolve: any) => resolve(result),
    }

    // insert/update return the chain too
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.update = vi.fn().mockReturnValue(chain)
    chain.upsert = vi.fn().mockReturnValue(chain)

    return chain
  }

  const client = {
    from: vi.fn((table: string) => {
      callLog.push({ table, op: 'from' })
      return buildChain(table, 'select')
    }),
  }

  // Spezial-Handling: insert auf einer Tabelle soll anderen Result liefern
  const originalFrom = client.from
  client.from = vi.fn((table: string) => {
    const chain = buildChain(table, 'select')
    // Override insert to use insertResult
    const config = tables[table] ?? {}
    chain.insert = vi.fn(() => {
      callLog.push({ table, op: 'insert' })
      const insertRes = config.insertResult ?? { data: null, error: null }
      return {
        ...chain,
        select: vi.fn().mockReturnValue({
          single: vi.fn(() => Promise.resolve(insertRes)),
          then: (resolve: any) => resolve(insertRes),
        }),
        then: (resolve: any) => resolve(insertRes),
      }
    })
    callLog.push({ table, op: 'from' })
    return chain
  }) as any

  return { client, callLog }
}

describe('Ereignis-Emitter', () => {
  // ── emitEreignis laedt passende Regeln ────────────────────────

  describe('emitEreignis laedt passende Regeln', () => {
    it('fragt ops_ereignis_regeln mit ereignis_typ + aktiv=true ab', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: { data: [], error: null },
        },
        ops_aktivitaetslog: {
          insertResult: { data: { id: 'log-1' }, error: null },
        },
      })

      const result = await emitEreignis(mock.client as any, {
        organizationId: ORG,
        ereignisTyp: 'aufgabe_faellig',
        entitaetId: 'a-1',
        akteurId: 'u-1',
      })

      expect(result.regeln).toBe(0)
      expect(result.benachrichtigungen).toBe(0)
      expect(mock.client.from).toHaveBeenCalledWith('ops_ereignis_regeln')
    })

    it('wirft Fehler wenn Regeln nicht geladen werden koennen', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: { data: null, error: { message: 'DB nicht erreichbar' } },
        },
      })

      await expect(
        emitEreignis(mock.client as any, {
          organizationId: ORG,
          ereignisTyp: 'aufgabe_faellig',
          entitaetId: 'a-1',
          akteurId: 'u-1',
        }),
      ).rejects.toThrow('Ereignisregeln konnten nicht geladen werden')
    })
  })

  // ── emitEreignis erzeugt Benachrichtigungen ───────────────────

  describe('emitEreignis erzeugt Benachrichtigungen', () => {
    it('erzeugt Benachrichtigung fuer direkt zugewiesenen User', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: {
            data: [{
              id: 'evr-1',
              empfaenger_user_id: 'u-pdl',
              empfaenger_rolle: null,
              titel_vorlage: 'Aufgabe faellig: {titel}',
              nachricht_vorlage: 'Die Aufgabe "{titel}" ist faellig.',
              kategorie: 'aufgabe',
              aktiv: true,
            }],
            error: null,
          },
        },
        ops_benachrichtigungs_praeferenzen: {
          maybeSingleResult: { data: null, error: null },
        },
        ops_benachrichtigungen: {
          insertResult: { data: null, error: null },
        },
        ops_aktivitaetslog: {
          insertResult: { data: { id: 'log-1' }, error: null },
        },
      })

      const result = await emitEreignis(mock.client as any, {
        organizationId: ORG,
        ereignisTyp: 'aufgabe_faellig',
        entitaetId: 'a-1',
        akteurId: 'u-1',
        kontext: { titel: 'Pflegebericht pruefen' },
      })

      expect(result.regeln).toBe(1)
      expect(result.benachrichtigungen).toBe(1)
      expect(mock.client.from).toHaveBeenCalledWith('ops_benachrichtigungen')
    })

    it('erzeugt Benachrichtigungen fuer rollenbasierte Empfaenger', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: {
            data: [{
              id: 'evr-1',
              empfaenger_user_id: null,
              empfaenger_rolle: 'pdl',
              titel_vorlage: 'Eskalation: {titel}',
              nachricht_vorlage: 'Die Aufgabe wurde eskaliert.',
              kategorie: 'aufgabe',
              aktiv: true,
            }],
            error: null,
          },
        },
        // Rollenbasierte Empfaenger werden in zwei Schritten aufgeloest:
        // Mitglieder der Org -> davon die Profile mit passender Rolle.
        // (Kein PostgREST-Embed: organization_members hat keinen FK auf profiles.)
        organization_members: {
          selectResult: {
            data: [{ user_id: 'u-pdl-1' }, { user_id: 'u-pdl-2' }, { user_id: 'u-engel-9' }],
            error: null,
          },
        },
        profiles: {
          selectResult: {
            data: [{ id: 'u-pdl-1' }, { id: 'u-pdl-2' }],
            error: null,
          },
        },
        ops_benachrichtigungs_praeferenzen: {
          maybeSingleResult: { data: null, error: null },
        },
        ops_benachrichtigungen: {
          insertResult: { data: null, error: null },
        },
        ops_aktivitaetslog: {
          insertResult: { data: { id: 'log-1' }, error: null },
        },
      })

      const result = await emitEreignis(mock.client as any, {
        organizationId: ORG,
        ereignisTyp: 'aufgabe_eskaliert',
        entitaetId: 'a-1',
        akteurId: 'system',
        kontext: { titel: 'Dringende Aufgabe' },
      })

      expect(result.regeln).toBe(1)
      // Zwei PDL-Benutzer gefunden
      expect(result.benachrichtigungen).toBe(2)
    })
  })

  // ── emitEreignis beruecksichtigt Praeferenzen ─────────────────

  describe('emitEreignis beruecksichtigt Praeferenzen', () => {
    it('ueberspringt Empfaenger mit deaktivierter Praeferenz', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: {
            data: [{
              id: 'evr-1',
              empfaenger_user_id: 'u-pdl',
              empfaenger_rolle: null,
              titel_vorlage: 'Aufgabe: {titel}',
              nachricht_vorlage: 'Nachricht.',
              kategorie: 'aufgabe',
              aktiv: true,
            }],
            error: null,
          },
        },
        ops_benachrichtigungs_praeferenzen: {
          maybeSingleResult: {
            data: { aktiv: false, in_app: true, email: false, push: false },
            error: null,
          },
        },
        ops_benachrichtigungen: {
          insertResult: { data: null, error: null },
        },
        ops_aktivitaetslog: {
          insertResult: { data: { id: 'log-1' }, error: null },
        },
      })

      const result = await emitEreignis(mock.client as any, {
        organizationId: ORG,
        ereignisTyp: 'aufgabe_faellig',
        entitaetId: 'a-1',
        akteurId: 'u-1',
        kontext: { titel: 'Test' },
      })

      // Empfaenger hat Praeferenz deaktiviert -> keine Benachrichtigung
      expect(result.benachrichtigungen).toBe(0)
    })
  })

  // ── emitEreignis protokolliert im Aktivitaetslog ──────────────

  describe('emitEreignis protokolliert im Aktivitaetslog', () => {
    it('erzeugt einen Log-Eintrag', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: { data: [], error: null },
        },
        ops_aktivitaetslog: {
          insertResult: { data: { id: 'log-42' }, error: null },
        },
      })

      const result = await emitEreignis(mock.client as any, {
        organizationId: ORG,
        ereignisTyp: 'aufgabe_erstellt',
        entitaetId: 'a-1',
        akteurId: 'u-1',
      })

      expect(result.log_id).toBe('log-42')
      expect(mock.client.from).toHaveBeenCalledWith('ops_aktivitaetslog')
    })

    it('gibt null als log_id zurueck wenn Log-Insert fehlschlaegt', async () => {
      const mock = createEmitterMock({
        ops_ereignis_regeln: {
          selectResult: { data: [], error: null },
        },
        ops_aktivitaetslog: {
          insertResult: { data: null, error: { message: 'Log-Fehler' } },
        },
      })

      const result = await emitEreignis(mock.client as any, {
        organizationId: ORG,
        ereignisTyp: 'aufgabe_erstellt',
        entitaetId: 'a-1',
        akteurId: 'u-1',
      })

      expect(result.log_id).toBeNull()
    })
  })
})
