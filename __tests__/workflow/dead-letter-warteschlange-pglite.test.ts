/**
 * PGlite: DB-Funktion `wf_execute_queue_item` (Migration 20260813010000)
 *
 * `lib/workflow/dead-letter.ts` und `lib/workflow/warteschlange.ts` lesen und
 * retryen nur — die eigentliche Versuchszaehlung, das exponentielle Backoff
 * und der Uebergang in den Dead-Letter-Endzustand passieren ausschliesslich
 * in dieser SQL-Funktion. Ein Unit-Test gegen die TS-Wrapper wuerde diese
 * Grenzfaelle nie sehen (dort wird nur `.update(...)` gemockt) — dieser Test
 * laedt die WORTGLEICHE Funktion aus der Migration gegen ein minimales
 * Schema (echtes Postgres via PGlite) und prueft:
 *
 *   1. Ein fehlschlagender Schritt erhoeht `versuch` und plant den naechsten
 *      Versuch mit `now() + 2^versuch Minuten` (exponentielles Backoff) —
 *      der Eintrag bleibt 'wartend', landet NICHT sofort im Dead Letter.
 *   2. Nach Erreichen von `max_versuche` wechselt der Eintrag nach
 *      'dead_letter' und es entsteht GENAU EIN `wf_dead_letter`-Datensatz
 *      mit der korrekten Versuchszahl — das ist der Endzustand, der laut
 *      Projekt-Historie fehlenden Mahn-/Zustellungs-Queues gefehlt hat
 *      (kein Versuchszaehler, kein Endzustand).
 *   3. Jeder Versuch (Erfolg wie Fehlschlag) hinterlaesst einen unveraender-
 *      lichen `wf_audit_log`-Eintrag — ein stecken gebliebener Lauf waere
 *      damit im Audit-Trail sichtbar, nicht nur "verschwunden".
 *
 * Die Aktion nutzt bewusst den Typ 'webhook': er ist durch den
 * CHECK-Constraint auf `wf_aktionen.typ` erlaubt, wird von der CASE-Anweisung
 * in `wf_execute_queue_item` aber (noch) nicht implementiert und faellt
 * deterministisch in den ELSE-Zweig (`RAISE EXCEPTION 'Unbekannter
 * Aktionstyp'`) — ohne dass Fremdtabellen (ops_aufgaben, organization_members
 * usw.) im minimalen Testschema existieren muessen.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { tabelleAusMigration, funktionAusMigration } from '../helpers/sql-extract'

const MIGRATION = '20260813010000_workflow_engine.sql'
const ORG = '00000000-0000-4000-8000-000460629986'

/** Entfernt FKs auf Tabellen, die im minimalen Testschema fehlen. */
function ohneFremdFks(sql: string): string {
  return sql.replace(/\s*REFERENCES public\.(organizations|profiles)\(id\)/g, '')
}

describe('DB-Funktion wf_execute_queue_item — Retry/Dead-Letter-Grenzfaelle', () => {
  let db: InstanceType<typeof PGlite>
  let eventId: string
  let regelId: string
  let aktionId: string

  beforeAll(async () => {
    db = new PGlite()

    for (const tabelle of [
      'wf_events', 'wf_regeln', 'wf_aktionen',
      'wf_ausfuehrungen', 'wf_warteschlange', 'wf_dead_letter', 'wf_audit_log',
    ]) {
      await db.exec(ohneFremdFks(tabelleAusMigration(MIGRATION, tabelle)))
    }

    await db.exec(funktionAusMigration(MIGRATION, 'wf_execute_queue_item'))

    const event = await db.query<{ id: string }>(
      `INSERT INTO public.wf_events (organization_id, event_typ, modul, quell_tabelle, idempotency_key)
       VALUES ($1, 'aufgabe_erstellt', 'aufgaben', 'ops_aufgaben', 'test-key-1') RETURNING id`,
      [ORG],
    )
    eventId = event.rows[0].id

    const regel = await db.query<{ id: string }>(
      `INSERT INTO public.wf_regeln (organization_id, bezeichnung, event_typ, modul)
       VALUES ($1, 'Test-Regel', 'aufgabe_erstellt', 'aufgaben') RETURNING id`,
      [ORG],
    )
    regelId = regel.rows[0].id

    // 'webhook' ist per CHECK erlaubt, aber in der CASE-Anweisung nicht
    // implementiert -> deterministischer Fehlschlag ohne Fremdtabellen.
    const aktion = await db.query<{ id: string }>(
      `INSERT INTO public.wf_aktionen (organization_id, regel_id, typ, konfiguration)
       VALUES ($1, $2, 'webhook', '{}'::jsonb) RETURNING id`,
      [ORG, regelId],
    )
    aktionId = aktion.rows[0].id
  })

  afterAll(async () => {
    await db?.close()
  })

  async function neuerWarteschlangenEintrag(maxVersuche: number): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.wf_warteschlange (organization_id, event_id, regel_id, aktion_id, versuch, max_versuche)
       VALUES ($1, $2, $3, $4, 1, $5) RETURNING id`,
      [ORG, eventId, regelId, aktionId, maxVersuche],
    )
    return rows[0].id
  }

  it('erhoeht den Versuchszaehler und plant Backoff, statt sofort Dead Letter zu werden', async () => {
    const queueId = await neuerWarteschlangenEintrag(3)

    const { rows } = await db.query<{ wf_execute_queue_item: boolean }>(
      `SELECT wf_execute_queue_item($1)`, [queueId],
    )
    expect(rows[0].wf_execute_queue_item).toBe(false)

    const { rows: eintrag } = await db.query<{
      status: string; versuch: number; naechster_versuch: string; fehler_nachricht: string
    }>(`SELECT status, versuch, naechster_versuch, fehler_nachricht FROM public.wf_warteschlange WHERE id = $1`, [queueId])

    expect(eintrag[0].status).toBe('wartend')
    expect(eintrag[0].versuch).toBe(2)
    expect(eintrag[0].fehler_nachricht).toContain('Unbekannter Aktionstyp')
    expect(new Date(eintrag[0].naechster_versuch).getTime()).toBeGreaterThan(Date.now())

    const deadLetter = await db.query(`SELECT * FROM public.wf_dead_letter WHERE warteschlange_id = $1`, [queueId])
    expect(deadLetter.rows).toHaveLength(0)

    const audit = await db.query<{ typ: string }>(
      `SELECT typ FROM public.wf_audit_log WHERE entitaet_id = $1 ORDER BY created_at`, [queueId],
    )
    expect(audit.rows.map((r) => r.typ)).toEqual(['retry'])
  })

  it('wechselt bei Erreichen von max_versuche in den Dead-Letter-Endzustand — genau ein Eintrag, korrekte Versuchszahl', async () => {
    const queueId = await neuerWarteschlangenEintrag(2)

    // 1. Fehlschlag: versuch 1 -> 2, bleibt 'wartend' (1 < max_versuche=2).
    await db.query(`SELECT wf_execute_queue_item($1)`, [queueId])
    const zwischenstand = await db.query<{ status: string; versuch: number }>(
      `SELECT status, versuch FROM public.wf_warteschlange WHERE id = $1`, [queueId],
    )
    expect(zwischenstand.rows[0]).toEqual({ status: 'wartend', versuch: 2 })

    // 2. Fehlschlag: versuch (2) >= max_versuche (2) -> Dead Letter, Endzustand.
    await db.query(`SELECT wf_execute_queue_item($1)`, [queueId])
    const endzustand = await db.query<{ status: string; versuch: number; fehler_nachricht: string }>(
      `SELECT status, versuch, fehler_nachricht FROM public.wf_warteschlange WHERE id = $1`, [queueId],
    )
    expect(endzustand.rows[0].status).toBe('dead_letter')
    expect(endzustand.rows[0].versuch).toBe(2)

    const deadLetter = await db.query<{ versuche: number; manuell_wiederholt: boolean }>(
      `SELECT versuche, manuell_wiederholt FROM public.wf_dead_letter WHERE warteschlange_id = $1`, [queueId],
    )
    expect(deadLetter.rows).toHaveLength(1)
    expect(deadLetter.rows[0].versuche).toBe(2)
    expect(deadLetter.rows[0].manuell_wiederholt).toBe(false)

    // Ein dritter Aufruf gegen den bereits 'dead_letter'-Eintrag darf NICHTS
    // mehr aendern: die Funktion greift nur auf status='wartend' zu — der
    // Endzustand ist wirklich ein Endzustand, kein wiederholbarer Zwischenstand.
    const dritterAufruf = await db.query<{ wf_execute_queue_item: boolean }>(
      `SELECT wf_execute_queue_item($1)`, [queueId],
    )
    expect(dritterAufruf.rows[0].wf_execute_queue_item).toBe(false)
    const unveraendert = await db.query(`SELECT COUNT(*)::int AS n FROM public.wf_dead_letter WHERE warteschlange_id = $1`, [queueId])
    expect((unveraendert.rows[0] as any).n).toBe(1)

    const audit = await db.query<{ typ: string }>(
      `SELECT typ FROM public.wf_audit_log WHERE entitaet_id = $1 ORDER BY created_at`, [queueId],
    )
    expect(audit.rows.map((r) => r.typ)).toEqual(['retry', 'dead_letter'])
  })

  it('protokolliert jeden Ausfuehrungsversuch in wf_ausfuehrungen — auch fehlgeschlagene', async () => {
    const queueId = await neuerWarteschlangenEintrag(5)
    await db.query(`SELECT wf_execute_queue_item($1)`, [queueId])

    const { rows } = await db.query<{ status: string; fehler_nachricht: string }>(
      `SELECT status, fehler_nachricht FROM public.wf_ausfuehrungen WHERE event_id = $1 AND aktion_id = $2`,
      [eventId, aktionId],
    )
    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[rows.length - 1].status).toBe('fehlgeschlagen')
    expect(rows[rows.length - 1].fehler_nachricht).toContain('Unbekannter Aktionstyp')
  })
})
