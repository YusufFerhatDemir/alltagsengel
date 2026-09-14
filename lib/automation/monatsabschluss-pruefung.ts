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
import { zaehltAlsUnterschrieben, ohneStornierte } from '@/lib/leistungsnachweis/status-sync'
import { logger } from '@/lib/logger'
const log = logger.child('monatsabschluss-pruefung')

export interface MonatsabschlussPruefungErgebnis {
  monat: string
  /** Nachweise auf `draft`/`incomplete` — noch nicht fertig erfasst. */
  unvollstaendig: number
  /**
   * Nachweise, die FERTIG aussehen, aber keinen Unterschriftsbeleg tragen.
   *
   * Sie stehen auf `signed`/`complete` und fallen durch jede Sichtprüfung —
   * die Nachweisliste zeigt sie als erledigt. Der Sammelrechnungslauf
   * überspringt sie trotzdem mit `UNTERSCHRIFT_FEHLT`, weil er den BELEG
   * verlangt (`proof_status='UNTERSCHRIEBEN'` oder einen Signatur-Hash) und
   * nicht das Statuswort.
   */
  ohneBeleg: number
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
    log.error('Zählung fehlgeschlagen', { errorMessage: countErr.message })
    return { monat, unvollstaendig: 0, ohneBeleg: 0, aufgabeErstellt: false }
  }

  const unvollstaendigAnzahl = count ?? 0

  // ── Der zweite, unsichtbare Fall ──────────────────────────────────────
  //
  // Am 14.09.2026 live gefunden: dreizehn Nachweise aus vier Monaten stehen
  // auf `signed`, tragen aber `proof_status='ENTWURF'` und keinen Hash. Fuer
  // die Zaehlung oben sind sie fertig; fuer den Sammelrechnungslauf sind sie
  // es nicht. Die Leistung ist erbracht, die Rechnung kommt nie, und keine
  // Liste zeigte es an.
  //
  // Gefragt wird mit der Regel der Rechnungs-RPC (`zaehltAlsUnterschrieben`),
  // denn genau deren Urteil soll die Aufgabe ankuendigen. Das ist bewusst
  // NICHT die Frage, die das Kundenportal stellt — dort zaehlt das
  // Unterschriftsbild mit (siehe lib/kunde/leistungen.ts).
  //
  // Stornierte Nachweise bleiben draussen: sie stehen weiter auf 'signed'
  // (STORNIERT hat kein status-Gegenstueck), werden aber nie abgerechnet.
  // Sie als Mangel zu melden hiesse, den Betrieb einer Leistung
  // hinterherzuschicken, die jemand ausdruecklich widerrufen hat. Dafuer
  // muss `billing_status` mitgelesen werden — ohne die Spalte antwortet
  // `istStorniert` immer mit false.
  const { data: fertige, error: belegErr } = await supabase
    .from('service_records')
    .select('id, proof_status, signature_hash, billing_status')
    .eq('organization_id', organizationId)
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .in('status', ['signed', 'complete'])

  if (belegErr) {
    log.error('Belegprüfung fehlgeschlagen', { errorMessage: belegErr.message })
  }
  const ohneBeleg = ohneStornierte(fertige ?? []).filter(r => !zaehltAlsUnterschrieben(r)).length

  if (unvollstaendigAnzahl === 0 && ohneBeleg === 0) {
    return { monat, unvollstaendig: 0, ohneBeleg: 0, aufgabeErstellt: false }
  }

  const { data: vorhanden, error: dupErr } = await supabase
    .from('ops_aufgaben')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('metadata->>monatsabschluss_monat', monat)
    .limit(1)
    .maybeSingle()

  if (dupErr) {
    log.error('Dublettenprüfung fehlgeschlagen', { errorMessage: dupErr.message })
    return { monat, unvollstaendig: unvollstaendigAnzahl, ohneBeleg, aufgabeErstellt: false }
  }
  if (vorhanden) {
    return { monat, unvollstaendig: unvollstaendigAnzahl, ohneBeleg, aufgabeErstellt: false }
  }

  const verantwortlichId = await ersterPdlDerOrg(supabase, organizationId)

  const { data: aufgabe, error: insErr } = await supabase
    .from('ops_aufgaben')
    .insert({
      organization_id: organizationId,
      titel: ohneBeleg > 0 && unvollstaendigAnzahl > 0
        ? `Monatsabschluss ${monat}: ${unvollstaendigAnzahl} unvollständig, ${ohneBeleg} ohne Unterschriftsbeleg`
        : ohneBeleg > 0
          ? `Monatsabschluss ${monat}: ${ohneBeleg} Leistungsnachweise ohne Unterschriftsbeleg`
          : `Monatsabschluss ${monat} blockiert: ${unvollstaendigAnzahl} Leistungsnachweise unvollständig`,
      beschreibung: [
        unvollstaendigAnzahl > 0
          ? `${unvollstaendigAnzahl} Leistungsnachweis(e) aus ${monat} stehen noch auf Entwurf/unvollständig. `
            + `Der Monatsabschluss (POST /api/billing/monthly-closing) markiert Positionen ohne abgeschlossenen `
            + `Nachweis als nicht abrechenbar — bitte vor dem Abschluss vervollständigen.`
          : null,
        // Der zweite Satz ist der wichtigere: diese Nachweise SEHEN fertig
        // aus. Ohne Hinweis sucht niemand nach ihnen.
        ohneBeleg > 0
          ? `${ohneBeleg} Leistungsnachweis(e) aus ${monat} gelten als abgeschlossen oder unterschrieben, `
            + `tragen aber KEINEN Unterschriftsbeleg. Der Sammelrechnungslauf überspringt sie mit `
            + `„UNTERSCHRIFT_FEHLT" — die Leistung ist erbracht, eine Rechnung entsteht nicht. `
            + `Prüfen mit: npm run verify:sammelrechnung (Punkt S13c).`
          : null,
      ].filter(Boolean).join('\n\n'),
      kategorie: 'abrechnung',
      prioritaet: 'hoch',
      status: 'offen',
      verantwortlich_id: verantwortlichId,
      erstellt_von: actorId,
      faellig_am: heuteBerlin(),
      tags: ohneBeleg > 0
        ? ['monatsabschluss', 'nachweis_unvollstaendig', 'unterschrift_fehlt']
        : ['monatsabschluss', 'nachweis_unvollstaendig'],
      metadata: {
        monatsabschluss_monat: monat,
        unvollstaendig: unvollstaendigAnzahl,
        ohne_beleg: ohneBeleg,
        quelle: 'automatisch_monatsabschluss',
      },
    })
    .select('id')
    .single()

  if (insErr || !aufgabe) {
    log.error('Anlage fehlgeschlagen', { errorMessage: insErr?.message })
    return { monat, unvollstaendig: unvollstaendigAnzahl, ohneBeleg, aufgabeErstellt: false }
  }

  await logAuditEvent({
    action: 'create', actorId, organizationId, entityType: 'ops_aufgabe', entityId: aufgabe.id,
    details: {
      grund: ohneBeleg > 0 ? 'monatsabschluss_unterschrift_fehlt' : 'monatsabschluss_unvollstaendig',
      monat, unvollstaendig: unvollstaendigAnzahl, ohne_beleg: ohneBeleg,
    },
  }).catch(err => log.error('Audit fehlgeschlagen', { errorMessage: String(err) }))

  return { monat, unvollstaendig: unvollstaendigAnzahl, ohneBeleg, aufgabeErstellt: true }
}
