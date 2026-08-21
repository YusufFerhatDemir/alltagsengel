/**
 * Rückläufer-Verarbeitung — Import und Zuordnung von Rückmeldungen
 *
 * Rückmeldungen kommen von Datenannahmestellen/Kostenträgern als Antwort
 * auf übermittelte DTA-Dateien. Sie enthalten:
 * - Quittungen (technische Bestätigung des Empfangs)
 * - Annahmebestätigungen (fachliche Prüfung bestanden)
 * - Fehlermeldungen (technisch/fachlich abgelehnt)
 * - Abrechnungsergebnisse (mit Einzelpositionen)
 * - Zahlungsavise (Überweisungsankündigung)
 *
 * Original-Rückmeldung wird IMMER unverändert gespeichert.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction, computeContentHash } from '../billing/core/audit'
import { erstelleRuecklaeuferAufgabe, AUFGABEN_AUSLOESENDE_STATUS } from './ruecklaeufer-aufgaben'
import { klassifiziereFehlercode, type Abrechnungsverfahren } from './ruecklaeufer-fehlercodes'
import { logger } from '@/lib/logger'
const log = logger.child('ruecklaeufer')

// ── Types ───────────────────────────────────────────────────────

export type RuecklaeuferTyp =
  | 'quittung' | 'annahmebestaetigung' | 'fehlermeldung'
  | 'abrechnungsergebnis' | 'zahlungsavis' | 'sonstige'

export type RuecklaeuferStatus =
  | 'eingegangen' | 'in_verarbeitung' | 'zugeordnet'
  | 'angenommen' | 'angenommen_mit_hinweis'
  | 'teilweise_abgelehnt' | 'abgelehnt'
  | 'technischer_fehler' | 'fachlicher_fehler'
  | 'duplikat' | 'korrektur_erforderlich'
  | 'korrektur_erstellt' | 'erledigt'

export interface RuecklaeuferPosition {
  invoiceItemId?: string
  positionNummer?: number
  leistungsart?: string
  leistungsdatum?: string
  betragAngefordertCent?: number
  betragAnerkannt_cent?: number
  fehlerCode?: string
  fehlerText?: string
  ablehnungsgrund?: string
  status: 'offen' | 'angenommen' | 'abgelehnt' | 'gekuerzt' | 'korrigiert'
}

export interface RuecklaeuferImportParams {
  organizationId: string
  laufId?: string
  /** § 302 SGB V — Zuordnung zu sgb_v_laeufe statt abrechnungslaeufe. */
  sgbVLaufId?: string
  dakotaAuftragId?: string
  invoiceId?: string
  clientId?: string
  kostentraegerIk?: string
  ruecklaeuferTyp: RuecklaeuferTyp
  originalMeldung: string
  quelldateiName?: string
  quelldateiUrl?: string
  positionen?: RuecklaeuferPosition[]
  betragAngefordertCent?: number
  betragAnerkannt_cent?: number
  fehlerCode?: string
  fehlerText?: string
  hinweise?: string[]
  ablehnungsgruende?: string[]
  /**
   * Verfahren, aus dem der Fehlercode stammt. Steuert, welche Einträge aus
   * `dta_fehlercode_katalog` überhaupt greifen dürfen. Ohne Angabe wird nicht
   * gefiltert (bisheriges Verhalten des § 105-Pfads).
   */
  verfahren?: Abrechnungsverfahren
  actorId: string
}

export interface RuecklaeuferImportErgebnis {
  ruecklaeuferId: string
  status: RuecklaeuferStatus
  zugeordnet: boolean
  positionenGesamt: number
  positionenAngenommen: number
  positionenAbgelehnt: number
  fehlerErstellt: boolean
  /** Id der automatisch erzeugten Aufgabe, oder null wenn keine nötig/möglich war. */
  aufgabeId: string | null
  /** true, wenn zu diesem Rückläufer bereits eine Aufgabe existierte. */
  aufgabeDublette: boolean
  /** Neu in die Wiedervorlage-Queue aufgenommene Positionen. */
  wiedervorlageEintraege: number
}

// ── Rückläufer importieren ──────────────────────────────────────

export async function importiereRuecklaeufer(
  supabase: SupabaseClient,
  params: RuecklaeuferImportParams,
): Promise<RuecklaeuferImportErgebnis> {
  // Hash der Quelldatei für Duplikat-Erkennung
  const quelldateiHash = params.originalMeldung
    ? await computeContentHash({ content: params.originalMeldung })
    : undefined

  // Duplikat prüfen
  if (quelldateiHash) {
    const { data: existing } = await supabase
      .from('dta_ruecklaeufer')
      .select('id')
      .eq('organization_id', params.organizationId)
      .eq('quelldatei_hash', quelldateiHash)
      .maybeSingle()

    if (existing) {
      return {
        ruecklaeuferId: existing.id,
        status: 'duplikat',
        zugeordnet: false,
        positionenGesamt: 0,
        positionenAngenommen: 0,
        positionenAbgelehnt: 0,
        fehlerErstellt: false,
        aufgabeId: null,
        aufgabeDublette: false,
        wiedervorlageEintraege: 0,
      }
    }
  }

  // Status aus Typ ableiten
  const status = statusAusTyp(params.ruecklaeuferTyp, params.fehlerCode)

  // Positionen zählen
  const posAngenommen = params.positionen?.filter(p => p.status === 'angenommen').length ?? 0
  const posAbgelehnt = params.positionen?.filter(p =>
    p.status === 'abgelehnt' || p.status === 'gekuerzt',
  ).length ?? 0

  // Rückläufer anlegen
  const { data: ruecklaeufer, error } = await supabase
    .from('dta_ruecklaeufer')
    .insert({
      organization_id: params.organizationId,
      lauf_id: params.laufId || null,
      sgb_v_lauf_id: params.sgbVLaufId || null,
      dakota_auftrag_id: params.dakotaAuftragId || null,
      invoice_id: params.invoiceId || null,
      client_id: params.clientId || null,
      kostentraeger_ik: params.kostentraegerIk || null,
      ruecklaeufer_typ: params.ruecklaeuferTyp,
      status,
      fehler_code: params.fehlerCode || null,
      fehler_text: params.fehlerText || null,
      original_meldung: params.originalMeldung,
      betrag_angefordert_cent: params.betragAngefordertCent ?? null,
      betrag_anerkannt_cent: params.betragAnerkannt_cent ?? null,
      positionen_gesamt: params.positionen?.length ?? 0,
      positionen_angenommen: posAngenommen,
      positionen_abgelehnt: posAbgelehnt,
      ablehnungsgruende: params.ablehnungsgruende ?? [],
      hinweise: params.hinweise ?? [],
      quelldatei_url: params.quelldateiUrl || null,
      quelldatei_hash: quelldateiHash || null,
      quelldatei_name: params.quelldateiName || null,
      bearbeitet_von: params.actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !ruecklaeufer) {
    throw new Error(`Rückläufer konnte nicht erstellt werden: ${error?.message}`)
  }

  // Positionen speichern
  if (params.positionen?.length) {
    const posRows = params.positionen.map((p, i) => ({
      organization_id: params.organizationId,
      ruecklaeufer_id: ruecklaeufer.id,
      invoice_item_id: p.invoiceItemId || null,
      position_nummer: p.positionNummer ?? (i + 1),
      leistungsart: p.leistungsart || null,
      leistungsdatum: p.leistungsdatum || null,
      status: p.status,
      betrag_angefordert_cent: p.betragAngefordertCent ?? null,
      betrag_anerkannt_cent: p.betragAnerkannt_cent ?? null,
      fehler_code: p.fehlerCode || null,
      fehler_text: p.fehlerText || null,
      ablehnungsgrund: p.ablehnungsgrund || null,
    }))

    await supabase.from('dta_ruecklaeufer_positionen').insert(posRows)
  }

  // Lauf-Status aktualisieren (wenn zugeordnet)
  let zugeordnet = false
  if (params.laufId) {
    const { data: lauf } = await supabase
      .from('abrechnungslaeufe')
      .select('id')
      .eq('id', params.laufId)
      .eq('organization_id', params.organizationId)
      .maybeSingle()

    if (lauf) {
      zugeordnet = true
      const laufAntwortStatus = mapRuecklaeuferZuLaufStatus(status)
      if (laufAntwortStatus) {
        await supabase
          .from('abrechnungslaeufe')
          .update({
            antwort_status: laufAntwortStatus,
            antwort_am: new Date().toISOString(),
            antwort_datei_url: params.quelldateiUrl || null,
          })
          .eq('id', params.laufId)
          .eq('organization_id', params.organizationId)

        const neuerLaufStatus = mapAntwortZuLaufStatus(laufAntwortStatus)
        if (neuerLaufStatus) {
          await supabase
            .from('abrechnungslaeufe')
            .update({ status: neuerLaufStatus })
            .eq('id', params.laufId)
            .eq('organization_id', params.organizationId)
        }
      }
    }
  }

  // § 302 SGB V — dieselbe Zuordnung, aber gegen sgb_v_laeufe statt
  // abrechnungslaeufe: eigenes Statusvokabular (sgb_v_laeufe.status), kein
  // antwort_datei_url-Feld auf dieser Tabelle.
  if (params.sgbVLaufId) {
    const { data: sgbVLauf } = await supabase
      .from('sgb_v_laeufe')
      .select('id')
      .eq('id', params.sgbVLaufId)
      .eq('organization_id', params.organizationId)
      .maybeSingle()

    if (sgbVLauf) {
      zugeordnet = true
      const laufAntwortStatus = mapRuecklaeuferZuLaufStatus(status)
      if (laufAntwortStatus) {
        await supabase
          .from('sgb_v_laeufe')
          .update({ antwort_status: laufAntwortStatus, antwort_am: new Date().toISOString() })
          .eq('id', params.sgbVLaufId)
          .eq('organization_id', params.organizationId)

        const neuerLaufStatus = mapAntwortZuSgbVLaufStatus(laufAntwortStatus)
        if (neuerLaufStatus) {
          await supabase
            .from('sgb_v_laeufe')
            .update({ status: neuerLaufStatus })
            .eq('id', params.sgbVLaufId)
            .eq('organization_id', params.organizationId)
        }
      }
    }
  }

  // Fehlerprotokoll erstellen bei Fehlern
  let fehlerErstellt = false
  let fehlerprotokollId: string | null = null
  if (['technischer_fehler', 'fachlicher_fehler', 'abgelehnt', 'teilweise_abgelehnt', 'korrektur_erforderlich'].includes(status)) {
    const { data: fehlerZeile } = await supabase.from('dta_fehlerprotokoll').insert({
      organization_id: params.organizationId,
      lauf_id: params.laufId || null,
      dakota_auftrag_id: params.dakotaAuftragId || null,
      ruecklaeufer_id: ruecklaeufer.id,
      invoice_id: params.invoiceId || null,
      client_id: params.clientId || null,
      kostentraeger_ik: params.kostentraegerIk || null,
      fehler_quelle: 'ruecklaeufer',
      fehler_kategorie: status === 'technischer_fehler' ? 'technisch' : 'fachlich',
      fehler_code: params.fehlerCode || null,
      fehler_meldung: params.fehlerText || `Rückläufer: ${status}`,
      original_meldung: params.originalMeldung?.slice(0, 2000) || null,
      schweregrad: status === 'abgelehnt' ? 'kritisch' : 'fehler',
      bearbeitungsstatus: 'neu',
    }).select('id').single()
    fehlerErstellt = true
    fehlerprotokollId = fehlerZeile?.id ?? null
  }

  // Fehlercode klassifizieren (Katalog vor Heuristik) — liefert den
  // Korrekturvorschlag, der unten in die Aufgabe wandert. Best effort:
  // ein Klassifizierungsfehler darf den Rückläufer-Import nicht blockieren.
  let korrekturvorschlag: string | null = null
  let fehlerKategorie: string | null = null
  if (AUFGABEN_AUSLOESENDE_STATUS.includes(status)) {
    try {
      const klassifizierung = await klassifiziereFehlercode(
        supabase, params.organizationId, params.fehlerCode, params.fehlerText, params.kostentraegerIk,
        params.verfahren ? { verfahren: params.verfahren } : undefined,
      )
      korrekturvorschlag = klassifizierung.massnahme
      fehlerKategorie = klassifizierung.kategorie
    } catch (err) {
      log.error('Fehlercode-Klassifizierung fehlgeschlagen', { errorMessage: String(err) })
    }
  }

  // Automatische Aufgabe bei technischem Rückläufer, Ablehnung oder Fehler.
  //
  // Bewusst hier und nicht in der API-Route: `importiereRuecklaeufer` ist der
  // einzige Weg, auf dem ein Rückläufer entsteht — der automatische Abruf über
  // `pruefeAntworten()` und jeder Job laufen ebenfalls hier durch. Die Route
  // erzeugte die Aufgabe frueher selbst, womit jeder andere Pfad still leer
  // ausging.
  const aufgabenErgebnis = await erstelleRuecklaeuferAufgabe(supabase, {
    organizationId: params.organizationId,
    ruecklaeuferId: ruecklaeufer.id,
    status,
    laufId: params.laufId,
    invoiceId: params.invoiceId,
    clientId: params.clientId,
    kostentraegerIk: params.kostentraegerIk,
    ruecklaeuferTyp: params.ruecklaeuferTyp,
    fehlerCode: params.fehlerCode,
    fehlerText: params.fehlerText,
    fehlerprotokollId,
    korrekturvorschlag,
    fehlerKategorie,
    positionenGesamt: params.positionen?.length ?? 0,
    positionenAbgelehnt: posAbgelehnt,
    betragAngefordertCent: params.betragAngefordertCent,
    betragAnerkanntCent: params.betragAnerkannt_cent,
    actorId: params.actorId,
  })

  // Abgelehnte/gekürzte Positionen in die Wiedervorlage-Queue.
  //
  // Hier und nicht in der API-Route, aus demselben Grund wie bei der Aufgabe:
  // `importiereRuecklaeufer` ist der einzige Weg, auf dem ein Rückläufer
  // entsteht — der automatische Antwortabruf läuft ebenfalls hier durch.
  //
  // Bewusst fehlertolerant: solange die Migration 20260902010000 nicht
  // angewendet ist, existiert `dta_wiedervorlage` nicht. Ein Fehler dabei darf
  // den Import der Rückmeldung nicht mitreissen — die Rückmeldung selbst ist
  // der Beleg und muss in jedem Fall ankommen. Der Arbeitsvorrat lässt sich
  // jederzeit über POST /api/billing/dta/wiedervorlage nachziehen.
  let wiedervorlageEintraege = 0
  if (['abgelehnt', 'teilweise_abgelehnt', 'fachlicher_fehler', 'technischer_fehler', 'korrektur_erforderlich'].includes(status)
      || posAbgelehnt > 0) {
    try {
      const { reiheRuecklaeuferEin } = await import('./wiedervorlage')
      const queue = await reiheRuecklaeuferEin(supabase, {
        ruecklaeuferId: ruecklaeufer.id,
        organizationId: params.organizationId,
        actorId: params.actorId,
      })
      wiedervorlageEintraege = queue.erstellt
    } catch (err) {
      log.error('Wiedervorlage konnte nicht befüllt werden (Import bleibt gültig)', { errorMessage: (err as Error).message })
    }
  }

  // Audit
  await logBillingAction(supabase, {
    entityType: 'dta_ruecklaeufer',
    organizationId: params.organizationId,
    entityId: ruecklaeufer.id,
    action: 'ruecklaeufer_importiert',
    newState: {
      typ: params.ruecklaeuferTyp,
      status,
      lauf_id: params.laufId,
      sgb_v_lauf_id: params.sgbVLaufId,
      positionen: params.positionen?.length ?? 0,
      fehler: fehlerErstellt,
      aufgabe_id: aufgabenErgebnis.aufgabeId,
      wiedervorlage_eintraege: wiedervorlageEintraege,
    },
    actorId: params.actorId,
  })

  return {
    ruecklaeuferId: ruecklaeufer.id,
    status,
    zugeordnet,
    positionenGesamt: params.positionen?.length ?? 0,
    positionenAngenommen: posAngenommen,
    positionenAbgelehnt: posAbgelehnt,
    fehlerErstellt,
    aufgabeId: aufgabenErgebnis.aufgabeId,
    aufgabeDublette: aufgabenErgebnis.dublette,
    wiedervorlageEintraege,
  }
}

// ── Automatische Zuordnung ──────────────────────────────────────

export async function ordneRuecklaeuferZu(
  supabase: SupabaseClient,
  ruecklaeuferId: string,
  laufId: string,
  actorId: string,
  organizationId?: string,
): Promise<void> {
  let rlQuery = supabase
    .from('dta_ruecklaeufer')
    .select('id, status, organization_id')
    .eq('id', ruecklaeuferId)
  if (organizationId) rlQuery = rlQuery.eq('organization_id', organizationId)
  const { data: rl } = await rlQuery.single()

  if (!rl) throw new Error('Rückläufer nicht gefunden')

  const { data: lauf } = await supabase
    .from('abrechnungslaeufe')
    .select('id')
    .eq('id', laufId)
    .eq('organization_id', rl.organization_id)
    .maybeSingle()
  if (!lauf) throw new Error('Abrechnungslauf nicht gefunden oder gehört zu einer anderen Organisation')

  await supabase
    .from('dta_ruecklaeufer')
    .update({
      lauf_id: laufId,
      status: 'zugeordnet',
      bearbeitet_von: actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .eq('id', ruecklaeuferId)

  await logBillingAction(supabase, {
    entityType: 'dta_ruecklaeufer',
    organizationId: rl.organization_id,
    entityId: ruecklaeuferId,
    action: 'ruecklaeufer_zugeordnet',
    previousState: { status: rl.status },
    newState: { status: 'zugeordnet', lauf_id: laufId },
    actorId,
  })
}

// ── Rückläufer als erledigt markieren ───────────────────────────

export async function markiereRuecklaeuferErledigt(
  supabase: SupabaseClient,
  ruecklaeuferId: string,
  actorId: string,
  organizationId?: string,
): Promise<void> {
  let erledigtUpdate = supabase
    .from('dta_ruecklaeufer')
    .update({
      status: 'erledigt',
      bearbeitet_von: actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .eq('id', ruecklaeuferId)
  if (organizationId) erledigtUpdate = erledigtUpdate.eq('organization_id', organizationId)

  // `.select()` statt blindem Update: ohne Rueckgabe blieb ein Aufruf mit
  // fremder organizationId ein stiller No-Op — die Zeile wurde nicht
  // veraendert, der Audit-Trail meldete trotzdem "erledigt".
  const { data: aktualisiert } = await erledigtUpdate
    .select('id, organization_id')
    .maybeSingle()

  if (!aktualisiert) {
    throw new Error('Rückläufer nicht gefunden oder gehört zu einer anderen Organisation')
  }

  await logBillingAction(supabase, {
    entityType: 'dta_ruecklaeufer',
    organizationId: aktualisiert.organization_id,
    entityId: ruecklaeuferId,
    action: 'ruecklaeufer_erledigt',
    actorId,
  })
}

// ── Hilfsfunktionen ─────────────────────────────────────────────

function statusAusTyp(typ: RuecklaeuferTyp, fehlerCode?: string): RuecklaeuferStatus {
  switch (typ) {
    case 'quittung': return 'angenommen'
    case 'annahmebestaetigung': return 'angenommen'
    case 'fehlermeldung': return fehlerCode?.startsWith('T') ? 'technischer_fehler' : 'fachlicher_fehler'
    case 'abrechnungsergebnis': return 'eingegangen'
    case 'zahlungsavis': return 'angenommen'
    case 'sonstige': return 'eingegangen'
    default: return 'eingegangen'
  }
}

function mapRuecklaeuferZuLaufStatus(rlStatus: RuecklaeuferStatus): string | null {
  switch (rlStatus) {
    case 'angenommen': return 'angenommen'
    case 'angenommen_mit_hinweis': return 'angenommen_mit_hinweis'
    case 'teilweise_abgelehnt': return 'teilweise_abgelehnt'
    case 'abgelehnt': return 'abgelehnt'
    case 'technischer_fehler': return 'technischer_fehler'
    case 'fachlicher_fehler': return 'fachlicher_fehler'
    case 'korrektur_erforderlich': return 'korrektur_erforderlich'
    default: return null
  }
}

function mapAntwortZuLaufStatus(antwortStatus: string): string | null {
  switch (antwortStatus) {
    case 'angenommen': return 'angenommen'
    case 'angenommen_mit_hinweis': return 'angenommen'
    case 'teilweise_abgelehnt': return 'teilweise_abgelehnt'
    case 'abgelehnt': return 'abgelehnt'
    case 'technischer_fehler': return 'korrektur_erforderlich'
    case 'fachlicher_fehler': return 'korrektur_erforderlich'
    case 'korrektur_erforderlich': return 'korrektur_erforderlich'
    default: return null
  }
}

/**
 * sgb_v_laeufe.status kennt kein 'angenommen_mit_hinweis' und keine eigenen
 * 'technischer_fehler'/'fachlicher_fehler'-Werte (siehe CHECK-Constraint in
 * 20260902020000_sgb_v_302_laeufe.sql) — beide fallen auf die vorhandenen
 * Nachbarwerte zurück, statt einen neuen Statuswert einzuführen, der dort
 * nicht erlaubt ist.
 */
function mapAntwortZuSgbVLaufStatus(antwortStatus: string): string | null {
  switch (antwortStatus) {
    case 'angenommen': return 'angenommen'
    case 'angenommen_mit_hinweis': return 'angenommen'
    case 'teilweise_abgelehnt': return 'teilweise_abgelehnt'
    case 'abgelehnt': return 'abgelehnt'
    case 'technischer_fehler': return 'korrektur_erforderlich'
    case 'fachlicher_fehler': return 'korrektur_erforderlich'
    case 'korrektur_erforderlich': return 'korrektur_erforderlich'
    default: return null
  }
}
