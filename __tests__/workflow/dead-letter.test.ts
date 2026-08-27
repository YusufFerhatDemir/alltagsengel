/**
 * Dead-Letter-Queue (lib/workflow/dead-letter.ts)
 *
 * `retryDeadLetter` ist der einzige Weg, eine endgueltig gescheiterte
 * Automation von Hand erneut auszuloesen. Ausgeloest wird ueber
 * `wf_emit_event`; was daraus folgt, fuehrt `wf_execute_queue_item` aus —
 * inklusive Schreibzugriffen auf `invoices`, `payments` und
 * `dunning_entries` sowie Mahnungen, Aufgaben und Eskalationen.
 *
 * Die uebliche Idempotenz der Engine greift hier bewusst NICHT: der
 * Idempotency-Key enthaelt `Date.now()` und ist pro Aufruf verschieden.
 * Der Schutz gegen doppelte Ausloesung muss deshalb vollstaendig in
 * diesem Modul sitzen. Genau das wird hier geprueft — und zwar nicht
 * daran, dass ein Fehler geworfen wird, sondern daran, dass beim
 * zweiten Versuch KEIN `wf_emit_event` mehr stattfindet.
 */

import { describe, it, expect } from 'vitest'
import { listDeadLetter, getDeadLetter, retryDeadLetter } from '@/lib/workflow/dead-letter'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { MAX_LIMIT } from '@/lib/workflow/validierung'
import {
  erstelleFakeSupabase,
  hatFilter,
  hatOrgFence,
  type FakeAufruf,
  type RpcAufruf,
} from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const ID = '77777777-7777-4777-8777-777777777777'
const EVENT_ID = '88888888-8888-4888-8888-888888888888'
const ACTOR = '99999999-9999-4999-8999-999999999999'

function deadLetterZeile(manuellWiederholt: boolean) {
  return {
    id: ID,
    organization_id: ORG,
    warteschlange_id: null,
    event_id: EVENT_ID,
    regel_id: '55555555-5555-4555-8555-555555555555',
    aktion_id: '66666666-6666-4666-8666-666666666666',
    fehler_nachricht: 'Empfaenger nicht erreichbar',
    payload: { rechnung_id: 'r-1' },
    versuche: 3,
    manuell_wiederholt: manuellWiederholt,
    wiederholt_am: null,
    wiederholt_von: null,
    created_at: '2026-08-01T10:00:00Z',
  }
}

const EVENT_ZEILE = {
  event_typ: 'rechnung_ueberfaellig',
  modul: 'abrechnung',
  quell_tabelle: 'invoices',
  quell_id: 'r-1',
  payload: { rechnung_id: 'r-1' },
}

/**
 * Doppelgaenger mit ehrlichem CAS: das UPDATE auf `wf_dead_letter`
 * trifft nur, solange der Eintrag noch nicht als wiederholt markiert
 * ist. Der Zustand wird im Fake mitgefuehrt, damit ein zweiter Aufruf
 * denselben Weg nimmt wie in der Datenbank.
 */
function fakeMitDeadLetter(opts?: {
  bereitsWiederholt?: boolean
  existiert?: boolean
  emitFehler?: boolean
  eventFehlt?: boolean
}) {
  const existiert = opts?.existiert ?? true
  let wiederholt = opts?.bereitsWiederholt ?? false

  const antworten = (aufruf: FakeAufruf) => {
    if (aufruf.tabelle === 'wf_dead_letter') {
      if (aufruf.operation === 'update') {
        const payload = aufruf.payload as Record<string, unknown>
        // Ruecknahme des Anspruchs — kein CAS-Filter, immer wirksam.
        if (payload.manuell_wiederholt === false) {
          wiederholt = false
          return { data: deadLetterZeile(false) }
        }
        const cas = aufruf.filter.find(f => f.methode === 'eq' && f.spalte === 'manuell_wiederholt')
        if (!existiert) return { data: null }
        if (cas && cas.wert === false && wiederholt) return { data: null }
        wiederholt = true
        return { data: { ...deadLetterZeile(true) } }
      }
      return { data: existiert ? deadLetterZeile(wiederholt) : null }
    }
    if (aufruf.tabelle === 'wf_events') {
      return opts?.eventFehlt ? { data: null } : { data: EVENT_ZEILE }
    }
    return { data: null }
  }

  const rpcGeber = (_a: RpcAufruf) =>
    opts?.emitFehler
      ? { error: { message: 'Emit fehlgeschlagen' } }
      : { data: 'neues-event-id' }

  return erstelleFakeSupabase(antworten, undefined, rpcGeber)
}

// ---------------------------------------------------------------------------
// 1 — Erfolgsfall
// ---------------------------------------------------------------------------

describe('retryDeadLetter — Erfolgsfall', () => {
  it('loest das urspruengliche Event erneut aus', async () => {
    const mock = fakeMitDeadLetter()
    const ergebnis = await retryDeadLetter(mock.client, {
      organizationId: ORG, id: ID, wiederholtVon: ACTOR,
    })

    expect(ergebnis.neuesEventId).toBe('neues-event-id')
    expect(mock.rpcAuf('wf_emit_event')).toHaveLength(1)
  })

  it('uebernimmt Typ, Modul und Quelle aus dem urspruenglichen Event', async () => {
    const mock = fakeMitDeadLetter()
    await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })

    const args = mock.rpcAuf('wf_emit_event')[0].args as Record<string, unknown>
    expect(args.p_event_typ).toBe('rechnung_ueberfaellig')
    expect(args.p_modul).toBe('abrechnung')
    expect(args.p_quell_tabelle).toBe('invoices')
    expect(args.p_organization_id).toBe(ORG)
    expect(args.p_ausgeloest_von).toBe(ACTOR)
  })

  it('vermerkt, wer wiederholt hat', async () => {
    const mock = fakeMitDeadLetter()
    await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })

    const payload = mock.ersterAuf('wf_dead_letter', 'update')?.payload as Record<string, unknown>
    expect(payload.manuell_wiederholt).toBe(true)
    expect(payload.wiederholt_von).toBe(ACTOR)
    expect(payload.wiederholt_am).toEqual(expect.any(String))
  })
})

// ---------------------------------------------------------------------------
// 2 — Schutz gegen doppelte Ausloesung
// ---------------------------------------------------------------------------

describe('retryDeadLetter — doppelte Ausloesung', () => {
  /**
   * Der Kerntest. Frueher wurde `manuell_wiederholt` nie geprueft und
   * erst NACH dem Emit gesetzt — zwei Klicks ergaben zwei echte
   * Wiederholungen und damit zwei Mahnlaeufe.
   */
  it('loest beim zweiten Aufruf kein zweites Event aus', async () => {
    const mock = fakeMitDeadLetter()

    await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })
    await expect(retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR }))
      .rejects.toThrow(/bereits manuell wiederholt/)

    // Die eigentliche Zusicherung: genau EIN Emit, nicht zwei.
    expect(mock.rpcAuf('wf_emit_event')).toHaveLength(1)
  })

  it('lehnt einen bereits wiederholten Eintrag ohne jeden Emit ab', async () => {
    const mock = fakeMitDeadLetter({ bereitsWiederholt: true })
    await expect(retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR }))
      .rejects.toThrow(UserFacingError)
    expect(mock.rpcAuf('wf_emit_event')).toHaveLength(0)
  })

  it('meldet den Konflikt als 409', async () => {
    const mock = fakeMitDeadLetter({ bereitsWiederholt: true })
    try {
      await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect((e as UserFacingError).status).toBe(409)
    }
  })

  /**
   * Reihenfolge ist die eigentliche Absicherung: der Anspruch muss vor
   * dem Ausloesen stehen. Andernfalls kann ein zweiter, gleichzeitiger
   * Aufruf das Event bereits erzeugt haben, bevor die Markierung greift.
   */
  it('beansprucht den Eintrag VOR dem Ausloesen', async () => {
    let updatesVorEmit = -1
    const mock = erstelleFakeSupabase(
      aufruf => {
        if (aufruf.tabelle === 'wf_dead_letter') {
          return aufruf.operation === 'update'
            ? { data: deadLetterZeile(true) }
            : { data: deadLetterZeile(false) }
        }
        if (aufruf.tabelle === 'wf_events') return { data: EVENT_ZEILE }
        return { data: null }
      },
      undefined,
      () => {
        updatesVorEmit = mock.auf('wf_dead_letter').filter(a => a.operation === 'update').length
        return { data: 'neues-event-id' }
      },
    )

    await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })
    expect(updatesVorEmit).toBe(1)
  })

  it('setzt die CAS-Bedingung und den Mandanten-Fence ins Update', async () => {
    const mock = fakeMitDeadLetter()
    await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })

    const update = mock.ersterAuf('wf_dead_letter', 'update')
    expect(hatFilter(update, 'eq', 'manuell_wiederholt', false)).toBe(true)
    expect(hatFilter(update, 'eq', 'id', ID)).toBe(true)
    expect(hatOrgFence(update, ORG)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3 — Ruecknahme des Anspruchs
// ---------------------------------------------------------------------------

describe('retryDeadLetter — Ruecknahme bei Fehlschlag', () => {
  /**
   * Ohne Ruecknahme waere der Eintrag als wiederholt markiert, obwohl
   * nie ein Versuch stattgefunden hat — und damit dauerhaft blockiert,
   * weil der CAS jeden weiteren Versuch ablehnt.
   */
  it('gibt den Anspruch frei, wenn das Ausloesen fehlschlaegt', async () => {
    const mock = fakeMitDeadLetter({ emitFehler: true })
    await expect(retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR }))
      .rejects.toThrow(/nicht ausgeloest werden/)

    const updates = mock.auf('wf_dead_letter').filter(a => a.operation === 'update')
    expect(updates).toHaveLength(2)
    const ruecknahme = updates[1].payload as Record<string, unknown>
    expect(ruecknahme.manuell_wiederholt).toBe(false)
    expect(ruecknahme.wiederholt_am).toBeNull()
    expect(ruecknahme.wiederholt_von).toBeNull()
  })

  it('bleibt nach einem Fehlschlag erneut ausloesbar', async () => {
    const mock = fakeMitDeadLetter({ emitFehler: true })
    await expect(retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR }))
      .rejects.toThrow()

    // Zweiter Anlauf darf nicht am CAS scheitern — der Fake fuehrt den
    // zurueckgenommenen Zustand mit.
    await expect(retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR }))
      .rejects.toThrow(/nicht ausgeloest werden/)
  })

  it('gibt den Anspruch frei, wenn das urspruengliche Event fehlt', async () => {
    const mock = fakeMitDeadLetter({ eventFehlt: true })
    await expect(retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR }))
      .rejects.toThrow(/Event konnte nicht geladen werden/)

    const updates = mock.auf('wf_dead_letter').filter(a => a.operation === 'update')
    expect(updates).toHaveLength(2)
    expect((updates[1].payload as Record<string, unknown>).manuell_wiederholt).toBe(false)
    expect(mock.rpcAuf('wf_emit_event')).toHaveLength(0)
  })

  /**
   * Infrastrukturfehler duerfen nicht als UserFacingError herausgehen —
   * sonst landet die Postgres-Meldung beim Client.
   */
  it('reicht Datenbankdetails nicht an den Client durch', async () => {
    const mock = fakeMitDeadLetter({ emitFehler: true })
    try {
      await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect(e).not.toBeInstanceOf(UserFacingError)
    }
  })
})

// ---------------------------------------------------------------------------
// 4 — Nicht gefunden / fremder Mandant
// ---------------------------------------------------------------------------

describe('retryDeadLetter — nicht gefunden', () => {
  it('meldet einen unbekannten Eintrag als 404 ohne Emit', async () => {
    const mock = fakeMitDeadLetter({ existiert: false })
    try {
      await retryDeadLetter(mock.client, { organizationId: ORG, id: ID, wiederholtVon: ACTOR })
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect((e as UserFacingError).status).toBe(404)
    }
    expect(mock.rpcAuf('wf_emit_event')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 5 — Lesepfade
// ---------------------------------------------------------------------------

describe('getDeadLetter / listDeadLetter', () => {
  it('setzt den Mandanten-Fence beim Einzelabruf', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: deadLetterZeile(false) }))
    await getDeadLetter(mock.client, { organizationId: ORG, id: ID })
    expect(hatOrgFence(mock.ersterAuf('wf_dead_letter'), ORG)).toBe(true)
  })

  it('setzt den Mandanten-Fence beim Listen', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    await listDeadLetter(mock.client, { organizationId: ORG })
    expect(hatOrgFence(mock.ersterAuf('wf_dead_letter'), ORG)).toBe(true)
  })

  it('deckelt ein ueberhohes Limit', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    await listDeadLetter(mock.client, { organizationId: ORG, limit: 99_999 })
    expect(hatFilter(mock.ersterAuf('wf_dead_letter'), 'limit', String(MAX_LIMIT))).toBe(true)
  })

  it('weist ein negatives Limit ab', async () => {
    const mock = erstelleFakeSupabase(() => ({ data: [] }))
    await expect(listDeadLetter(mock.client, { organizationId: ORG, limit: -1 }))
      .rejects.toThrow(/mindestens 1/)
  })
})
