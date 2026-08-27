// ═══════════════════════════════════════════════════════════════════════
// API-Fehler-Sanitizer (lib/utils/api-error.ts)
//
// safeDbError()/safeErrorResponse() entscheiden, was von einem
// Datenbankfehler beim Client ankommt. Sie standen ohne eigenen Test da,
// obwohl jede Route sie benutzt.
//
// Gefunden dabei: die Objektart-Liste in PG_PATTERNS deckte nur
// „permission denied for table|schema|function" ab. Postgres schreibt aber
// je nach Objekt auch „… for relation", „… for view", „… for sequence" —
// diese Meldungen gingen unverändert an den Client, samt Tabellennamen.
// Der letzte Block dieser Suite ist die Sperrklinke dagegen.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { safeDbError, safeErrorResponse } from '@/lib/utils/api-error'

const text = async (antwort: Response) => (await antwort.json()).error as string

describe('safeDbError — Struktur der Antwort', () => {
  it('behält den übergebenen Statuscode', async () => {
    const antwort = safeDbError({ message: 'irgendwas' }, 409, 'Konflikt.')
    expect(antwort.status).toBe(409)
  })

  it('antwortet auch bei null-Fehler mit dem Ersatztext', async () => {
    const antwort = safeDbError(null, 500, 'Datenbankfehler.')
    expect(await text(antwort)).toBe('Datenbankfehler.')
  })

  it('lässt eine unverfängliche Meldung durch — sie hilft beim Beheben', async () => {
    const antwort = safeDbError({ message: 'Der Zeitraum liegt in der Zukunft.' }, 400, 'Fehler.')
    expect(await text(antwort)).toBe('Der Zeitraum liegt in der Zukunft.')
  })
})

describe('safeDbError — Postgres-Interna werden ersetzt', () => {
  const ERSATZ = 'Vorgang konnte nicht gespeichert werden.'

  const verfaenglich = [
    'new row for relation "invoices" violates check constraint "invoices_status_check"',
    'insert or update on table "payments" violates foreign key constraint "payments_invoice_id_fkey"',
    'duplicate key value violates unique constraint "billing_tariffs_pkey"',
    'null value in column "organization_id" of relation "clients" violates not-null constraint',
    'relation "wf_audit_log" does not exist',
    'column "kasse_status" does not exist',
    'new row violates row-level security policy for table "service_records"',
    'syntax error at or near "SELCT"',
    'function public.create_invoice_draft_atomic(uuid) does not exist',
    'could not serialize access due to concurrent update',
  ]

  for (const meldung of verfaenglich) {
    it(`ersetzt: ${meldung.slice(0, 52)}…`, async () => {
      const antwort = safeDbError({ message: meldung }, 500, ERSATZ)
      expect(await text(antwort)).toBe(ERSATZ)
    })
  }
})

describe('safeDbError — "permission denied" in JEDER Objektart', () => {
  // Postgres wählt das Wort nach dem Objekt. Vor dem Fix deckte die
  // Musterliste nur table/schema/function ab; alles andere ging samt
  // Objektnamen an den Client.
  const ERSATZ = 'Kein Zugriff.'
  const objektarten = [
    'permission denied for table billing_tariffs',
    'permission denied for relation billing_tariffs',
    'permission denied for view pflege_uebersicht',
    'permission denied for materialized view analytics_monatsumsatz',
    'permission denied for sequence invoices_number_seq',
    'permission denied for schema public',
    'permission denied for function public.zaehle_kassentarife',
    'permission denied for database postgres',
    'permission denied to set role "service_role"',
  ]

  for (const meldung of objektarten) {
    it(`ersetzt: ${meldung}`, async () => {
      const antwort = safeDbError({ message: meldung }, 500, ERSATZ)
      const ausgabe = await text(antwort)
      expect(ausgabe).toBe(ERSATZ)
      // Kein Objektname darf durchrutschen.
      expect(ausgabe).not.toMatch(/billing_tariffs|pflege_uebersicht|invoices_number_seq|zaehle_kassentarife/)
    })
  }
})

describe('safeErrorResponse — dieselbe Regel für geworfene Fehler', () => {
  it('ersetzt eine verfängliche Exception-Meldung', async () => {
    const antwort = safeErrorResponse(
      new Error('permission denied for relation dunning_entries'), 500, 'Interner Fehler.')
    expect(await text(antwort)).toBe('Interner Fehler.')
  })

  it('verträgt Nicht-Error-Werte', async () => {
    expect(await text(safeErrorResponse(null, 500, 'Interner Fehler.'))).toBe('')
    expect(await text(safeErrorResponse('Zeitraum ungültig.', 400, 'Fehler.'))).toBe('Zeitraum ungültig.')
  })
})
