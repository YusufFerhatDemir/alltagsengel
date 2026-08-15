/**
 * Kette 7 — Leistungsnachweis fehlt → Monatsabschluss blockieren.
 *
 * `lib/abrechnung/monatsabschluss.ts::erstelleMonatsabschluss()` markiert
 * unvollständige Verordnungen bereits mit `abrechenbar: false` / `ampel:
 * 'gelb'` — das ist der inhaltliche Block. Er hatte bis 2026-08-15 aber
 * KEINEN automatischen Auslöser (nur manuell über POST
 * /api/billing/monthly-closing) und lief zusätzlich immer gegen ein
 * konkretes Bundesland samt Preistabellen, was für eine reine
 * Vollständigkeitsprüfung unnötig schwer ist.
 *
 * Diese Datei prüft leichtgewichtig — ohne Preisermittlung — ob der
 * VORMONAT vollständig erfasste Leistungsnachweise hat, und meldet sonst
 * eine Aufgabe an die Sachbearbeitung. Das ergänzt den inhaltlichen Block,
 * ersetzt ihn nicht: die verbindliche Sperre bei fehlender Unterschrift
 * bleibt in der RPC `create_invoice_draft_atomic` (Kette 8).
 *
 * DUBLETTENSCHUTZ: höchstens eine offene Aufgabe pro (Organisation, Monat).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/audit-log'
import { ersterPdlDerOrg } from './org-empfaenger'
import { heuteBerlin } from '@/lib/utils/timezone'

export interface MonatsabschlussPruefungErgebnis {
  monat: string
  unvollstaendig: number
  aufgabeErstellt: boolean
}

/** Liefert den Vormonat als 'YYYY-MM'. */
function vormonat(): string {
  const heute = new Date(heuteBerlin())
  heute.setDate(1)
  heute.setMonth(heute.getMonth() - 1)
  return heute.toISOString().slice(0, 7)
}

export async function pruefeMonatsabschlussVollstaendigkeit(
  supabase: SupabaseClient,
  organizationId: string,
  actorId: string,
): Promise<MonatsabschlussPruefungErgebnis> {
  const monat = vormonat()
  const periodStart = `${monat}-01`
  const letzterTag = new Date(Number(monat.slice(0, 4)), Number(monat.slice(5, 7)), 0).getDate()
  const periodEnd = `${monat}-${String(letzterTag).padStart(2, '0')}`

  const { count, error: countErr } = await supabase
    .from('service_records')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .in('status', ['draft', 'incomplete'])

  if (countErr) {
    console.error(`[monatsabschluss-pruefung] Zählung fehlgeschlagen: ${countErr.message}`)
    return { monat, unvollstaendig: 0, aufgabeErstellt: false }
  }

  const unvollstaendigAnzahl = count ?? 0
  if (unvollstaendigAnzahl === 0) {
    return { monat, unvollstaendig: 0, aufgabeErstellt: false }
  }

  const { data: vorhanden, error: dupErr } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('metadata->>monatsabschluss_monat', monat)
    .limit(1)
    .maybeSingle()

  if (dupErr) {
    console.error(`[monatsabschluss-pruefung] Dublettenprüfung fehlgeschlagen: ${dupErr.message}`)
    return { monat, unvollstaendig: unvollstaendigAnzahl, aufgabeErstellt: false }
  }
  if (vorhanden) {
    return { monat, unvollstaendig: unvollstaendigAnzahl, aufgabeErstellt: false }
  }

  const verantwortlichId = await ersterPdlDerOrg(supabase, organizationId)

  const { data: aufgabe, error: insErr } = await supabase
    .from('ops_aufgaben')
    .insert({
      organization_id: organizationId,
      titel: `Monatsabschluss ${monat} blockiert: ${unvollstaendigAnzahl} Leistungsnachweise unvollständig`,
      beschreibung:
        `${unvollstaendigAnzahl} Leistungsnachweis(e) aus ${monat} stehen noch auf Entwurf/unvollständig. `
        + `Der Monatsabschluss (POST /api/billing/monthly-closing) markiert Positionen ohne abgeschlossenen `
        + `Nachweis als nicht abrechenbar — bitte vor dem Abschluss vervollständigen.`,
      kategorie: 'abrechnung',
      prioritaet: 'hoch',
      status: 'offen',
      verantwortlich_id: verantwortlichId,
      erstellt_von: actorId,
      faellig_am: heuteBerlin(),
      tags: ['monatsabschluss', 'nachweis_unvollstaendig'],
      metadata: { monatsabschluss_monat: monat, unvollstaendig: unvollstaendigAnzahl, quelle: 'automatisch_monatsabschluss' },
    })
    .select('id')
    .single()

  if (insErr || !aufgabe) {
    console.error(`[monatsabschluss-pruefung] Anlage fehlgeschlagen: ${insErr?.message}`)
    return { monat, unvollstaendig: unvollstaendigAnzahl, aufgabeErstellt: false }
  }

  await logAuditEvent({
    action: 'create', actorId, organizationId, entityType: 'ops_aufgabe', entityId: aufgabe.id,
    details: { grund: 'monatsabschluss_unvollstaendig', monat, unvollstaendig: unvollstaendigAnzahl },
  }).catch(err => console.error(`[monatsabschluss-pruefung] Audit fehlgeschlagen: ${err}`))

  return { monat, unvollstaendig: unvollstaendigAnzahl, aufgabeErstellt: true }
}
