/**
 * Automatische Aufgabe bei Kassenrückläufer.
 *
 * Ein technischer Rückläufer, eine Ablehnung oder ein Fehler aus der
 * DTA-Kette darf nicht nur im Fehlerprotokoll landen — es muss jemand
 * zuständig sein, mit Frist und Priorität. Diese Datei erzeugt die
 * dazugehörige `ops_aufgaben`-Zeile.
 *
 * WARUM HIER UND NICHT IN DER API-ROUTE
 * Vorher hing die Aufgaben-Erstellung ausschliesslich an
 * `POST /api/billing/dta/ruecklaeufer`. Jeder andere Weg, auf dem ein
 * Rückläufer entsteht — automatischer Abruf über `pruefeAntworten()`,
 * Import aus einem Korrekturlauf, ein direkter Aufruf von
 * `importiereRuecklaeufer()` aus einem Job — erzeugte still keine Aufgabe.
 * Die Erstellung sitzt deshalb jetzt an der Quelle (`importiereRuecklaeufer`),
 * und die Route ruft sie nicht mehr selbst auf.
 *
 * DUBLETTENSCHUTZ
 * Pro Rückläufer existiert höchstens eine Aufgabe. Der Schlüssel ist
 * `metadata->>ruecklaeufer_id`. Bewusst statusunabhängig: eine bereits
 * erledigte Aufgabe darf durch einen erneuten Import derselben Meldung
 * nicht wieder auftauchen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import { emitEreignis } from '../ops/ereignis-emitter'
import type { RuecklaeuferStatus } from './ruecklaeufer'
import { datumBerlin } from '@/lib/utils/timezone';

/** Rückläufer-Status, die eine Aufgabe auslösen. Alles andere ist Erfolg. */
export const AUFGABEN_AUSLOESENDE_STATUS: RuecklaeuferStatus[] = [
  'technischer_fehler',
  'fachlicher_fehler',
  'abgelehnt',
  'teilweise_abgelehnt',
  'korrektur_erforderlich',
]

export interface RuecklaeuferAufgabeParams {
  organizationId: string
  ruecklaeuferId: string
  status: RuecklaeuferStatus
  laufId?: string | null
  invoiceId?: string | null
  clientId?: string | null
  kostentraegerIk?: string | null
  ruecklaeuferTyp?: string | null
  fehlerCode?: string | null
  fehlerText?: string | null
  fehlerprotokollId?: string | null
  /** Korrekturvorschlag aus der Fehlercode-Klassifizierung (dta_fehlercode_katalog). */
  korrekturvorschlag?: string | null
  fehlerKategorie?: string | null
  positionenGesamt?: number
  positionenAbgelehnt?: number
  betragAngefordertCent?: number | null
  betragAnerkanntCent?: number | null
  /** Auslöser der Verarbeitung — landet als `erstellt_von` und im Audit-Trail. */
  actorId: string
  /** Optionaler expliziter Verantwortlicher. Ohne Angabe: erster Admin der Org. */
  verantwortlichId?: string | null
}

export interface RuecklaeuferAufgabeErgebnis {
  aufgabeId: string | null
  erstellt: boolean
  /** true, wenn für diesen Rückläufer bereits eine Aufgabe existierte. */
  dublette: boolean
  /** Gesetzt, wenn keine Aufgabe erzeugt wurde. */
  grund?: string
}

interface Einstufung {
  prioritaet: 'niedrig' | 'mittel' | 'hoch' | 'kritisch'
  /** Bearbeitungsfrist in Tagen ab heute. */
  fristTage: number
  titelPraefix: string
}

/**
 * Priorität und Frist aus dem Rückläufer-Status.
 *
 * Technische Fehler stehen bewusst vor fachlichen: eine technisch
 * zurückgewiesene Datei blockiert den gesamten Lauf, während eine fachliche
 * Teilablehnung nur einzelne Positionen betrifft.
 */
export function stufeRuecklaeuferEin(status: RuecklaeuferStatus): Einstufung {
  switch (status) {
    case 'abgelehnt':
      return { prioritaet: 'kritisch', fristTage: 3, titelPraefix: 'Abrechnung abgelehnt' }
    case 'korrektur_erforderlich':
      return { prioritaet: 'kritisch', fristTage: 3, titelPraefix: 'Korrektur erforderlich' }
    case 'technischer_fehler':
      return { prioritaet: 'kritisch', fristTage: 2, titelPraefix: 'Technischer Rückläufer' }
    case 'fachlicher_fehler':
      return { prioritaet: 'hoch', fristTage: 5, titelPraefix: 'Fachlicher Rückläufer' }
    case 'teilweise_abgelehnt':
      return { prioritaet: 'hoch', fristTage: 5, titelPraefix: 'Positionen abgelehnt' }
    default:
      return { prioritaet: 'mittel', fristTage: 7, titelPraefix: 'Rückläufer prüfen' }
  }
}

/** Datum in `fristTage` Tagen als ISO-Datum (YYYY-MM-DD). */
function faelligkeit(fristTage: number, ab: Date = new Date()): string {
  const d = new Date(ab.getTime())
  d.setDate(d.getDate() + fristTage)
  return datumBerlin(d)
}

function euro(cent?: number | null): string | null {
  if (cent == null) return null
  return (cent / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

/**
 * Erster Admin der Organisation.
 *
 * Zwei Queries statt eines PostgREST-Embeds: zwischen `organization_members`
 * und `profiles` existiert kein Foreign Key, ein `profiles!inner(...)`-Embed
 * scheitert mit PGRST200 und liefert still eine leere Liste. Dieselbe Falle
 * hat schon die rollenbasierten Benachrichtigungen lautlos abgeschaltet.
 */
async function ersterAdminDerOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const { data: mitglieder, error: mErr } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)

  if (mErr) {
    console.error(`[ruecklaeufer-aufgabe] organization_members fehlgeschlagen: ${mErr.message}`)
    return null
  }

  const userIds = (mitglieder ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean)
  if (userIds.length === 0) return null

  const { data: admins, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .in('id', userIds)
    .in('role', ['admin', 'superadmin'])
    .is('deleted_at', null)
    .limit(1)

  if (pErr) {
    console.error(`[ruecklaeufer-aufgabe] profiles fehlgeschlagen: ${pErr.message}`)
    return null
  }

  return admins?.[0]?.id ?? null
}

/**
 * Erzeugt die Aufgabe zu einem Rückläufer — idempotent pro `ruecklaeuferId`.
 *
 * Wirft nicht: ein Fehler beim Anlegen der Aufgabe darf den Rückläufer-Import
 * nicht rückgängig machen. Der Rückläufer selbst und das Fehlerprotokoll sind
 * die führenden Daten; die Aufgabe ist die Arbeitsanweisung darauf.
 */
export async function erstelleRuecklaeuferAufgabe(
  supabase: SupabaseClient,
  params: RuecklaeuferAufgabeParams,
): Promise<RuecklaeuferAufgabeErgebnis> {
  if (!AUFGABEN_AUSLOESENDE_STATUS.includes(params.status)) {
    return { aufgabeId: null, erstellt: false, dublette: false, grund: `Status ${params.status} löst keine Aufgabe aus` }
  }

  try {
    // ── Dublettenschutz ──────────────────────────────────────────
    const { data: vorhanden, error: dupErr } = await supabase
      .from('ops_aufgaben')
      .select('id')
      .eq('organization_id', params.organizationId)
      .eq('metadata->>ruecklaeufer_id', params.ruecklaeuferId)
      .limit(1)
      .maybeSingle()

    if (dupErr) {
      // Kein stiller Fallthrough: wenn die Dublettenprüfung scheitert, wird
      // KEINE Aufgabe angelegt. Eine doppelte Aufgabe ist teurer als eine
      // fehlende, die beim nächsten Import nachgezogen wird.
      console.error(`[ruecklaeufer-aufgabe] Dublettenprüfung fehlgeschlagen: ${dupErr.message}`)
      return { aufgabeId: null, erstellt: false, dublette: false, grund: `Dublettenprüfung fehlgeschlagen: ${dupErr.message}` }
    }

    if (vorhanden) {
      return { aufgabeId: vorhanden.id, erstellt: false, dublette: true, grund: 'Aufgabe existiert bereits' }
    }

    const einstufung = stufeRuecklaeuferEin(params.status)
    const verantwortlichId =
      params.verantwortlichId ?? (await ersterAdminDerOrg(supabase, params.organizationId))

    const titel = [
      einstufung.titelPraefix,
      params.kostentraegerIk ? `(IK ${params.kostentraegerIk})` : null,
    ].filter(Boolean).join(' ')

    const beschreibung = [
      `Rückläufer-Status: ${params.status}`,
      params.ruecklaeuferTyp ? `Rückläufer-Typ: ${params.ruecklaeuferTyp}` : null,
      params.fehlerCode ? `Fehlercode: ${params.fehlerCode}` : null,
      params.fehlerText ? `Fehlermeldung: ${params.fehlerText}` : null,
      params.fehlerKategorie ? `Fehlerkategorie: ${params.fehlerKategorie}` : null,
      params.korrekturvorschlag ? `Korrekturvorschlag: ${params.korrekturvorschlag}` : null,
      params.positionenAbgelehnt
        ? `${params.positionenAbgelehnt} von ${params.positionenGesamt ?? '?'} Positionen abgelehnt`
        : null,
      params.betragAngefordertCent != null ? `Angefordert: ${euro(params.betragAngefordertCent)}` : null,
      params.betragAnerkanntCent != null ? `Anerkannt: ${euro(params.betragAnerkanntCent)}` : null,
      params.kostentraegerIk ? `Kostenträger-IK: ${params.kostentraegerIk}` : null,
      params.laufId ? `Abrechnungslauf: ${params.laufId}` : null,
      '',
      `Rückläufer öffnen: /admin/ruecklaeufer?id=${params.ruecklaeuferId}`,
      params.laufId ? `Abrechnungslauf öffnen: /admin/dta/laeufe/${params.laufId}` : null,
      params.fehlerprotokollId ? `Fehlerprotokoll: /admin/abrechnungsfehler?id=${params.fehlerprotokollId}` : null,
    ].filter(v => v !== null).join('\n')

    const { data: aufgabe, error } = await supabase
      .from('ops_aufgaben')
      .insert({
        organization_id: params.organizationId,
        titel,
        beschreibung,
        kategorie: 'abrechnung',
        prioritaet: einstufung.prioritaet,
        status: 'offen',
        verantwortlich_id: verantwortlichId,
        erstellt_von: params.actorId,
        faellig_am: faelligkeit(einstufung.fristTage),
        abrechnungslauf_id: params.laufId || null,
        client_id: params.clientId || null,
        tags: ['kassenabrechnung', 'ruecklaeufer', params.status],
        metadata: {
          ruecklaeufer_id: params.ruecklaeuferId,
          ruecklaeufer_status: params.status,
          ruecklaeufer_typ: params.ruecklaeuferTyp ?? null,
          fehlerprotokoll_id: params.fehlerprotokollId ?? null,
          fehler_code: params.fehlerCode ?? null,
          fehler_kategorie: params.fehlerKategorie ?? null,
          korrekturvorschlag: params.korrekturvorschlag ?? null,
          invoice_id: params.invoiceId ?? null,
          kostentraeger_ik: params.kostentraegerIk ?? null,
          quelle: 'automatisch_ruecklaeufer',
        },
      })
      .select('id')
      .single()

    if (error || !aufgabe) {
      console.error(`[ruecklaeufer-aufgabe] Anlage fehlgeschlagen: ${error?.message}`)
      return { aufgabeId: null, erstellt: false, dublette: false, grund: error?.message ?? 'unbekannt' }
    }

    // ── Audit-Trail ──────────────────────────────────────────────
    await logBillingAction(supabase, {
      entityType: 'dta_ruecklaeufer',
      organizationId: params.organizationId,
      entityId: params.ruecklaeuferId,
      action: 'aufgabe_automatisch_erstellt',
      newState: {
        aufgabe_id: aufgabe.id,
        prioritaet: einstufung.prioritaet,
        faellig_am: faelligkeit(einstufung.fristTage),
        verantwortlich_id: verantwortlichId,
        status: params.status,
        fehler_code: params.fehlerCode ?? null,
      },
      actorId: params.actorId,
    }).catch((err) => {
      // Audit-Fehler darf die Aufgabe nicht zurückrollen — sie ist angelegt.
      console.error(`[ruecklaeufer-aufgabe] Audit fehlgeschlagen: ${err}`)
    })

    // Benachrichtigung ueber die konfigurierbaren Ereignisregeln.
    // Best effort und bewusst nachgelagert: ohne passende Regel in
    // `ops_ereignis_regeln` passiert schlicht nichts — die Aufgabe selbst
    // entsteht unabhaengig davon und haengt nicht an einer Konfiguration.
    await emitEreignis(supabase, {
      organizationId: params.organizationId,
      ereignisTyp: 'abrechnung_ruecklaefer',
      entitaetId: params.ruecklaeuferId,
      akteurId: params.actorId,
      kontext: {
        titel,
        status: params.status,
        fehler_code: params.fehlerCode ?? '',
        kostentraeger_ik: params.kostentraegerIk ?? '',
        aufgabe_id: aufgabe.id,
        verantwortlich_id: verantwortlichId ?? '',
      },
    }).catch((err) => {
      console.error(`[ruecklaeufer-aufgabe] Ereignis-Emit fehlgeschlagen: ${err}`)
    })

    return { aufgabeId: aufgabe.id, erstellt: true, dublette: false }
  } catch (err) {
    console.error(`[ruecklaeufer-aufgabe] unerwarteter Fehler: ${err}`)
    return { aufgabeId: null, erstellt: false, dublette: false, grund: String(err) }
  }
}
