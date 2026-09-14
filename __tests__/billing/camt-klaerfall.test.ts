/**
 * Der Klaerfall, der nur gezaehlt wurde
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 96, 14.09.2026)
 *
 * Beide Klaerfall-Anlagen von `app/api/billing/camt/import/route.ts`
 * standen als blosses `await supabase.from('klaerfaelle').insert({…})` —
 * ohne Zerlegung, ohne Fehlerpruefung. PostgREST wirft nicht: ein
 * abgewiesener INSERT kam als stilles `error` im Ergebnis zurueck.
 * `klaerfaelle++` stand davor.
 *
 * Die Antwort meldete danach N Klaerfaelle, `camt_imports` schrieb N fort,
 * der Pruefeintrag behauptete dasselbe — und es existierte keine Zeile,
 * die jemand haette abarbeiten koennen.
 *
 * Die STRECKE dazu prueft __tests__/e2e/camt-pipeline-pglite.test.ts gegen
 * echtes Postgres. Was dort nicht herstellbar ist, ist die zweite
 * Fehlschlagsart: „kein Fehler UND trotzdem keine Zeile". Eine Datenbank
 * gibt das nicht her, PostgREST schon — und genau dort laeuft eine
 * Zaehlung ins Leere. Dafuer ist dieser Modultest da.
 */
import { describe, it, expect } from 'vitest'
import { legeKlaerfallAn } from '../../lib/billing/camt/klaerfall'
import { erstelleFakeSupabase, hatOrgFence, type FakeAufruf } from '../helpers/supabase-fake'
import type { SupabaseClient } from '@supabase/supabase-js'

const ORG = '00000000-0000-4000-8000-00000000c001'
const ZE = '00000000-0000-4000-8000-00000000c002'

const EINTRAG = {
  organization_id: ORG,
  zahlungseingang_id: ZE,
  grund: 'Keine Zuordnung moeglich',
  vorschlaege: [{ invoiceId: 'r-1' }],
  status: 'offen',
}

function fake(antwort: (a: FakeAufruf) => { data?: unknown; error?: { message: string; code?: string } | null } | undefined) {
  const f = erstelleFakeSupabase(antwort)
  return { client: f.client as unknown as SupabaseClient, f }
}

describe('legeKlaerfallAn meldet seinen Ausgang', () => {
  it('meldet Erfolg, wenn eine Zeile entstanden ist', async () => {
    const { client } = fake(() => ({ data: [{ id: 'k-1' }], error: null }))
    expect(await legeKlaerfallAn(client, EINTRAG)).toEqual({ ok: true })
  })

  it('meldet den Fehler, wenn der INSERT abgewiesen wurde', async () => {
    const { client } = fake(() => ({ data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }))
    expect(await legeKlaerfallAn(client, EINTRAG)).toEqual({
      ok: false,
      grund: 'new row violates row-level security policy',
    })
  })

  it('meldet Fehlschlag auch OHNE Fehler, wenn keine Zeile zurueckkam', async () => {
    // Der Fall, den eine echte Datenbank nicht hergibt und der genau
    // deshalb uebersehen wurde: PostgREST meldet `error: null` und eine
    // leere Liste. Wer nur `error` prueft, zaehlt hier einen Klaerfall,
    // den es nicht gibt.
    const { client } = fake(() => ({ data: [], error: null }))
    expect(await legeKlaerfallAn(client, EINTRAG)).toEqual({
      ok: false,
      grund: 'keine Zeile angelegt',
    })
  })

  it('und auch, wenn gar nichts zurueckkam', async () => {
    const { client } = fake(() => ({ data: null, error: null }))
    expect((await legeKlaerfallAn(client, EINTRAG)).ok).toBe(false)
  })
})

describe('legeKlaerfallAn schreibt, was der Klaerfall braucht', () => {
  it('verlangt die Zeile zurueck — sonst ist der Ausgang nicht feststellbar', async () => {
    const { client, f } = fake(() => ({ data: [{ id: 'k-1' }], error: null }))
    await legeKlaerfallAn(client, EINTRAG)
    const a = f.aufrufe[0]
    expect(a.operation).toBe('insert')
    expect(a.tabelle).toBe('klaerfaelle')
    // Ohne select() liefert PostgREST keine Zeilen zurueck, und die
    // zweite Frage („ist wirklich etwas entstanden?") waere unbeantwortbar.
    expect(a.spalten).toBe('id')
  })

  it('traegt den Mandanten und den Zahlungseingang mit', async () => {
    // Ohne organization_id greift der RESTRICTIVE org_fence und der
    // INSERT scheitert; ohne zahlungseingang_id die NOT-NULL-Bedingung.
    // Beides live am 14.09.2026 aus dem Schema gelesen.
    const { client, f } = fake(() => ({ data: [{ id: 'k-1' }], error: null }))
    await legeKlaerfallAn(client, EINTRAG)
    const payload = f.aufrufe[0].payload as Record<string, unknown>
    expect(payload.organization_id).toBe(ORG)
    expect(payload.zahlungseingang_id).toBe(ZE)
    expect(payload.status).toBe('offen')
    expect(hatOrgFence(f.aufrufe[0], ORG)).toBe(false) // Fence im Datensatz, nicht im Filter
  })

  it('schreibt genau einmal — kein zweiter Versuch bei Fehlschlag', async () => {
    // Ein stiller Wiederholungsversuch waere die zweite Zeile zu
    // demselben Geldeingang, sobald der erste doch durchging.
    const { client, f } = fake(() => ({ data: null, error: { message: 'x' } }))
    await legeKlaerfallAn(client, EINTRAG)
    expect(f.aufrufe.filter(a => a.tabelle === 'klaerfaelle')).toHaveLength(1)
  })
})
