/**
 * Workflow-Warteschlange (lib/workflow/warteschlange.ts)
 *
 * Die manuellen Knoepfe „wiederholen" und „abbrechen" der Ops-Oberflaeche
 * greifen direkt in die Warteschlange der Workflow-Engine. Was die Engine
 * beim Abarbeiten eines Eintrags tut, steht in `wf_execute_queue_item`
 * (Migration 20260813010000, gehaertet in 20260824010000): sie schreibt
 * per `status_aendern`/`feld_aktualisieren` auf `invoices`, `payments`
 * und `dunning_entries` und erzeugt Mahnungen, Aufgaben, Eskalationen und
 * Benachrichtigungen. Ein Eintrag, der zweimal laeuft, ist deshalb eine
 * zweite Mahnung — kein kosmetischer Fehler.
 *
 * Die Datenbank claimt Eintraege bereits per CAS. Dieser Schutz greift
 * aber nur zwischen zwei Workern. Er greift NICHT, wenn ein Administrator
 * einen bereits erledigten Eintrag von Hand auf `wartend` zuruecksetzt:
 * danach ist der Zustand fuer den Worker vollkommen legitim.
 *
 * Geprueft wird deshalb vor allem:
 *   1. dass Endzustaende gesperrt sind (`erledigt`, `in_bearbeitung`),
 *   2. dass die Zustandspruefung IM UPDATE sitzt und nicht in einer
 *      vorgelagerten Abfrage — ein vorgeschaltetes SELECT waere ein
 *      TOCTOU-Fenster und damit genau der Fehler, den die DB-Migration
 *      auf ihrer Ebene bereits beseitigt hat,
 *   3. dass der Mandanten-Fence an jeder schreibenden Stelle sitzt.
 */

import { describe, it, expect } from 'vitest'
import {
  listWarteschlange,
  retryWarteschlangeEintrag,
  cancelWarteschlangeEintrag,
} from '@/lib/workflow/warteschlange'
import { UserFacingError } from '@/lib/api/user-facing-error'
import {
  ABBRECHBARE_QUEUE_STATUS,
  WIEDERHOLBARE_QUEUE_STATUS,
  MAX_LIMIT,
} from '@/lib/workflow/validierung'
import type { WfQueueStatus } from '@/lib/workflow/types'
import { erstelleFakeSupabase, hatFilter, hatOrgFence } from '../helpers/supabase-fake'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMD_ORG = '11111111-1111-4111-8111-111111111111'
const ID = '33333333-3333-4333-8333-333333333333'

function eintrag(status: WfQueueStatus) {
  return {
    id: ID,
    organization_id: ORG,
    event_id: '44444444-4444-4444-8444-444444444444',
    regel_id: '55555555-5555-4555-8555-555555555555',
    aktion_id: '66666666-6666-4666-8666-666666666666',
    prioritaet: 100,
    status,
    versuch: 3,
    max_versuche: 3,
    naechster_versuch: null,
    fehler_nachricht: 'Zeitueberschreitung beim Versand',
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
  }
}

/**
 * Baut einen Doppelgaenger, der einen Eintrag im Zustand `status` haelt
 * und den CAS ehrlich nachbildet: das UPDATE trifft nur dann eine Zeile,
 * wenn der Ist-Zustand in der `in`-Liste des Aufrufs steht.
 *
 * Genau diese Nachbildung macht den Test aussagekraeftig — ein Fake, der
 * jedes UPDATE gelingen laesst, wuerde eine fehlende Statusbedingung
 * nicht bemerken.
 */
function fakeMitZustand(status: WfQueueStatus | null, orgDerZeile = ORG) {
  return erstelleFakeSupabase(aufruf => {
    if (aufruf.tabelle !== 'wf_warteschlange') return { data: null }

    // Zeile gehoert einem anderen Mandanten oder existiert nicht.
    const sichtbar = status !== null
      && aufruf.filter.some(f => f.methode === 'eq' && f.spalte === 'organization_id' && f.wert === orgDerZeile)

    if (aufruf.operation === 'update') {
      const erlaubt = aufruf.filter.find(f => f.methode === 'in' && f.spalte === 'status')
      const liste = (erlaubt?.wert as string[] | undefined) ?? []
      if (!sichtbar || !liste.includes(status as string)) return { data: null }
      return { data: { ...eintrag(status as WfQueueStatus), ...(aufruf.payload as object) } }
    }

    // Nachschlag zur Fehlererklaerung.
    return { data: sichtbar ? eintrag(status as WfQueueStatus) : null }
  })
}

// ---------------------------------------------------------------------------
// 1 — Zustandsmaschine
// ---------------------------------------------------------------------------

describe('Zustandsmaschine der Warteschlange', () => {
  /**
   * `erledigt` ist der Zustand nach erfolgreicher Ausfuehrung. Stuende er
   * in einer der beiden Listen, waere die Doppelausfuehrung wieder offen —
   * deshalb wird er hier explizit festgenagelt und nicht nur indirekt
   * ueber die Funktionstests geprueft.
   */
  it('haelt "erledigt" aus beiden Listen heraus', () => {
    expect(WIEDERHOLBARE_QUEUE_STATUS).not.toContain('erledigt')
    expect(ABBRECHBARE_QUEUE_STATUS).not.toContain('erledigt')
  })

  it('haelt "in_bearbeitung" aus beiden Listen heraus', () => {
    expect(WIEDERHOLBARE_QUEUE_STATUS).not.toContain('in_bearbeitung')
    expect(ABBRECHBARE_QUEUE_STATUS).not.toContain('in_bearbeitung')
  })

  it('erlaubt Wiederholung aus dead_letter und fehlgeschlagen', () => {
    expect(WIEDERHOLBARE_QUEUE_STATUS).toContain('dead_letter')
    expect(WIEDERHOLBARE_QUEUE_STATUS).toContain('fehlgeschlagen')
  })
})

// ---------------------------------------------------------------------------
// 2 — retryWarteschlangeEintrag
// ---------------------------------------------------------------------------

describe('retryWarteschlangeEintrag', () => {
  it('reiht einen Dead-Letter-Eintrag wieder ein', async () => {
    const mock = fakeMitZustand('dead_letter')
    const ergebnis = await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })

    expect(ergebnis.status).toBe('wartend')
    const update = mock.ersterAuf('wf_warteschlange', 'update')
    expect(update).toBeDefined()
  })

  it('reiht einen manuell abgebrochenen Eintrag wieder ein', async () => {
    const mock = fakeMitZustand('fehlgeschlagen')
    const ergebnis = await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
    expect(ergebnis.status).toBe('wartend')
  })

  /**
   * Der Kernfall. Ohne Statusbedingung wuerde der erledigte Eintrag auf
   * `wartend` gesetzt, der Worker wuerde ihn regulaer claimen und die
   * Aktion ein zweites Mal ausfuehren.
   */
  it('verweigert die Wiederholung eines bereits erledigten Eintrags', async () => {
    const mock = fakeMitZustand('erledigt')
    await expect(retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID }))
      .rejects.toThrow(UserFacingError)

    await expect(retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID }))
      .rejects.toThrow(/bereits erfolgreich ausgefuehrt/)
  })

  it('meldet den Konflikt mit Status 409, nicht als Serverfehler', async () => {
    const mock = fakeMitZustand('erledigt')
    try {
      await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect(e).toBeInstanceOf(UserFacingError)
      expect((e as UserFacingError).status).toBe(409)
    }
  })

  /**
   * Ein laufender Eintrag darf nicht auf `wartend` zurueckgesetzt werden:
   * ein zweiter Worker koennte ihn dann parallel zum ersten claimen.
   */
  it('verweigert die Wiederholung eines gerade laufenden Eintrags', async () => {
    const mock = fakeMitZustand('in_bearbeitung')
    await expect(retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID }))
      .rejects.toThrow(/wird gerade verarbeitet/)
  })

  it('meldet einen unbekannten Eintrag als 404, nicht als Konflikt', async () => {
    const mock = fakeMitZustand(null)
    try {
      await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect(e).toBeInstanceOf(UserFacingError)
      expect((e as UserFacingError).status).toBe(404)
    }
  })

  /**
   * Der eigentliche Schutz gegen TOCTOU: die Statusbedingung muss Teil
   * des UPDATE sein. Steht sie in einem vorgelagerten SELECT, kann ein
   * Worker den Eintrag im Fenster dazwischen claimen.
   */
  it('prueft den Status IM Update, nicht in einer vorgelagerten Abfrage', async () => {
    const mock = fakeMitZustand('dead_letter')
    await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })

    const update = mock.ersterAuf('wf_warteschlange', 'update')
    expect(hatFilter(update, 'in', 'status', WIEDERHOLBARE_QUEUE_STATUS)).toBe(true)

    // Im Erfolgsfall genau ein Aufruf: kein SELECT davor.
    expect(mock.auf('wf_warteschlange')).toHaveLength(1)
  })

  it('setzt den Mandanten-Fence im Update', async () => {
    const mock = fakeMitZustand('dead_letter')
    await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
    expect(hatOrgFence(mock.ersterAuf('wf_warteschlange', 'update'), ORG)).toBe(true)
  })

  /**
   * Mandantenschutz: die Zeile existiert, gehoert aber einer anderen
   * Organisation. Ergebnis muss „nicht gefunden" sein — kein Zugriff und
   * auch kein Rueckschluss auf den Zustand der fremden Zeile.
   */
  it('greift nicht auf einen Eintrag einer fremden Organisation zu', async () => {
    const mock = fakeMitZustand('dead_letter', FREMD_ORG)
    try {
      await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect((e as UserFacingError).status).toBe(404)
    }
  })

  /**
   * Ein wartender Eintrag mit alter Fehlermeldung erscheint in der
   * Oberflaeche als fehlerhaft, obwohl er auf seinen naechsten Versuch
   * wartet.
   */
  it('leert die alte Fehlermeldung und terminiert neu', async () => {
    const mock = fakeMitZustand('dead_letter')
    const ergebnis = await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })

    expect(ergebnis.fehler_nachricht).toBeNull()
    const payload = mock.ersterAuf('wf_warteschlange', 'update')?.payload as Record<string, unknown>
    expect(payload.status).toBe('wartend')
    expect(payload.fehler_nachricht).toBeNull()
    expect(payload.naechster_versuch).toEqual(expect.any(String))
  })

  /**
   * Der Versuchszaehler ist Historie. Wuerde der Retry ihn zuruecksetzen,
   * verloere die Dead-Letter-Auswertung die Information, wie oft ein
   * Eintrag insgesamt gescheitert ist.
   */
  it('setzt den Versuchszaehler nicht zurueck', async () => {
    const mock = fakeMitZustand('dead_letter')
    await retryWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
    const payload = mock.ersterAuf('wf_warteschlange', 'update')?.payload as Record<string, unknown>
    expect(payload).not.toHaveProperty('versuch')
  })
})

// ---------------------------------------------------------------------------
// 3 — cancelWarteschlangeEintrag
// ---------------------------------------------------------------------------

describe('cancelWarteschlangeEintrag', () => {
  it('bricht einen wartenden Eintrag ab', async () => {
    const mock = fakeMitZustand('wartend')
    const ergebnis = await cancelWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })
    expect(ergebnis.status).toBe('fehlgeschlagen')
    expect(ergebnis.fehler_nachricht).toBe('Manuell abgebrochen')
  })

  /**
   * Ein erledigter Eintrag wurde ausgefuehrt. Ihn nachtraeglich als
   * fehlgeschlagen zu markieren faelscht die Historie — und damit jede
   * Auswertung, die auf dem Endstatus aufsetzt.
   */
  it('verweigert den Abbruch eines bereits erledigten Eintrags', async () => {
    const mock = fakeMitZustand('erledigt')
    await expect(cancelWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID }))
      .rejects.toThrow(/bereits erfolgreich ausgefuehrt/)
  })

  /**
   * Der Abbruch eines laufenden Eintrags waere wirkungslos: der Worker
   * ueberschreibt den Status nach Abschluss ohnehin.
   */
  it('verweigert den Abbruch eines gerade laufenden Eintrags', async () => {
    const mock = fakeMitZustand('in_bearbeitung')
    await expect(cancelWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID }))
      .rejects.toThrow(/wird gerade verarbeitet/)
  })

  it('verweigert den doppelten Abbruch', async () => {
    const mock = fakeMitZustand('fehlgeschlagen')
    await expect(cancelWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID }))
      .rejects.toThrow(/bereits abgebrochen/)
  })

  it('prueft den Status IM Update und setzt den Mandanten-Fence', async () => {
    const mock = fakeMitZustand('wartend')
    await cancelWarteschlangeEintrag(mock.client, { organizationId: ORG, id: ID })

    const update = mock.ersterAuf('wf_warteschlange', 'update')
    expect(hatFilter(update, 'in', 'status', ABBRECHBARE_QUEUE_STATUS)).toBe(true)
    expect(hatOrgFence(update, ORG)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4 — listWarteschlange
// ---------------------------------------------------------------------------

describe('listWarteschlange', () => {
  const leer = () => erstelleFakeSupabase(() => ({ data: [] }))

  it('setzt den Mandanten-Fence', async () => {
    const mock = leer()
    await listWarteschlange(mock.client, { organizationId: ORG })
    expect(hatOrgFence(mock.ersterAuf('wf_warteschlange'), ORG)).toBe(true)
  })

  /**
   * Die Route reicht `status` als blossen TypeScript-Cast durch. Ohne
   * Laufzeitpruefung wird daraus ein Filter auf einen Wert, den es in
   * der Spalte nicht gibt — die Antwort ist dann eine leere Liste, die
   * wie „keine Eintraege" aussieht statt wie „falscher Parameter".
   */
  it('weist einen unbekannten Status ab, statt leer zu antworten', async () => {
    const mock = leer()
    await expect(listWarteschlange(mock.client, {
      organizationId: ORG,
      status: 'gibt_es_nicht' as WfQueueStatus,
    })).rejects.toThrow(UserFacingError)
    expect(mock.aufrufe).toHaveLength(0)
  })

  it('laesst gueltige Status durch', async () => {
    const mock = leer()
    await listWarteschlange(mock.client, { organizationId: ORG, status: 'dead_letter' })
    expect(hatFilter(mock.ersterAuf('wf_warteschlange'), 'eq', 'status', 'dead_letter')).toBe(true)
  })

  /**
   * Ohne Deckel bestimmt der Aufrufer, wie viele Zeilen die Engine zieht.
   */
  it('deckelt ein ueberhohes Limit', async () => {
    const mock = leer()
    await listWarteschlange(mock.client, { organizationId: ORG, limit: 1_000_000 })
    // Der Doppelgaenger protokolliert `.limit(n)` mit der Zahl als "Spalte".
    expect(hatFilter(mock.ersterAuf('wf_warteschlange'), 'limit', String(MAX_LIMIT))).toBe(true)
  })

  /** `?limit=abc` wird in der Route zu `Number("abc")` = NaN. */
  it('weist ein nicht-numerisches Limit ab', async () => {
    const mock = leer()
    await expect(listWarteschlange(mock.client, { organizationId: ORG, limit: Number('abc') }))
      .rejects.toThrow(/muss eine Zahl sein/)
  })

  it('weist ein negatives Offset ab', async () => {
    const mock = leer()
    await expect(listWarteschlange(mock.client, { organizationId: ORG, offset: -5 }))
      .rejects.toThrow(/nicht negativ/)
  })
})
