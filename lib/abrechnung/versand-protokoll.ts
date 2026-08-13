/**
 * Versand-Protokoll — Nachweis jedes Übermittlungsversuchs.
 *
 * WARUM EIGENE TABELLE UND NICHT NUR DER AUDIT-TRAIL
 * `billing_audit_trail` beantwortet "wer hat einen Vorgang verändert".
 * Hier geht es um etwas anderes: "was ist beim Versuch, eine Datei an eine
 * Kasse zu übertragen, tatsächlich passiert" — inklusive der Versuche, bei
 * denen NICHTS hinausging. Genau die sind der interessante Fall: ein leeres
 * Audit hiesse "niemand hat etwas getan", während in Wahrheit die Pipeline
 * am Gate oder an der Readiness gestoppt hat.
 *
 * Beide werden geschrieben: das Protokoll für den technischen Verlauf, der
 * Audit-Trail für die Verantwortlichkeit. Schlägt der Audit-Eintrag fehl,
 * bleibt das Protokoll trotzdem stehen — der Nachweis über den Versand darf
 * nicht an einem Constraint einer anderen Tabelle hängen.
 *
 * KEINE SECRETS: Host ja, Benutzername/Key/Passwort nein. Die Protokolltexte
 * aus lib/abrechnung/transport.ts enthalten den SFTP-Benutzernamen — er wird
 * hier entfernt, bevor die Zeile geschrieben wird.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import { freigabeUebersicht } from './externe-freigaben'

export type VersandKanal = 'sftp_105' | 'sftp_302' | 'kim' | 'manuell'

export type VersandPhase =
  | 'vorbereitung' | 'verschluesselung' | 'gate'
  | 'uebertragung' | 'quittung' | 'antwortabruf'

export type VersandErgebnis =
  | 'erfolg' | 'testmodus' | 'gestoppt_extern' | 'gestoppt_intern' | 'fehler'

export interface VersandProtokollEintrag {
  organizationId: string
  kanal: VersandKanal
  phase: VersandPhase
  ergebnis: VersandErgebnis
  laufId?: string | null
  dakotaAuftragId?: string | null
  externeReferenz?: string | null
  protokoll?: string | null
  fehlerCode?: string | null
  fehlerMeldung?: string | null
  dateiName?: string | null
  dateiHash?: string | null
  dateiGroesseBytes?: number | null
  verschluesselt?: boolean
  empfaengerIk?: string | null
  zielHost?: string | null
  dauerMs?: number | null
  actorId: string
}

/**
 * Entfernt Zugangsdaten aus einem Transportprotokoll.
 *
 * `sendePerSFTP()` protokolliert Zeilen wie "Verbunden als abrechnung-user".
 * Der Benutzername ist die Hälfte eines Zugangs und hat in einer Tabelle, die
 * jeder Admin des Mandanten lesen darf, nichts zu suchen.
 */
export function entferneZugangsdaten(protokoll: string | null | undefined): string | null {
  if (!protokoll) return null
  return protokoll
    .replace(/Verbunden als \S+/g, 'Verbunden als «Benutzer»')
    .replace(/Login als \S+ erfolgreich/g, 'Login als «Benutzer» erfolgreich')
    // Falls je ein Fehlertext eines Transportclients einen Key/ein Passwort
    // durchreicht: gar nicht erst durchlassen.
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '«Private Key entfernt»')
    .replace(/(password|passwort|passphrase)\s*[:=]\s*\S+/gi, '$1: «entfernt»')
}

/**
 * Schreibt eine Protokollzeile und den zugehörigen Audit-Eintrag.
 *
 * Wirft NICHT: ein fehlgeschlagenes Protokoll darf einen laufenden Versand
 * weder abbrechen noch — schlimmer — nach einem erfolgreichen Upload einen
 * Fehler vortäuschen. Der Rückgabewert sagt, ob es geklappt hat.
 */
export async function protokolliereVersand(
  supabase: SupabaseClient,
  eintrag: VersandProtokollEintrag,
): Promise<{ protokollId: string | null; fehler: string | null }> {
  const uebersicht = freigabeUebersicht()
  const freigabeStatus = Object.fromEntries(
    uebersicht.freigaben.map(f => [f.id, f.freigegeben]),
  )

  let protokollId: string | null = null
  let fehler: string | null = null

  try {
    const { data, error } = await supabase
      .from('dta_versand_protokoll')
      .insert({
        organization_id: eintrag.organizationId,
        lauf_id: eintrag.laufId ?? null,
        dakota_auftrag_id: eintrag.dakotaAuftragId ?? null,
        externe_referenz: eintrag.externeReferenz ?? null,
        kanal: eintrag.kanal,
        phase: eintrag.phase,
        ergebnis: eintrag.ergebnis,
        protokoll: entferneZugangsdaten(eintrag.protokoll),
        fehler_code: eintrag.fehlerCode ?? null,
        fehler_meldung: eintrag.fehlerMeldung ?? null,
        datei_name: eintrag.dateiName ?? null,
        datei_hash: eintrag.dateiHash ?? null,
        datei_groesse_bytes: eintrag.dateiGroesseBytes ?? null,
        verschluesselt: eintrag.verschluesselt ?? false,
        empfaenger_ik: eintrag.empfaengerIk ?? null,
        ziel_host: eintrag.zielHost ?? null,
        freigabe_status: freigabeStatus,
        dauer_ms: eintrag.dauerMs ?? null,
        ausgeloest_von: eintrag.actorId,
      })
      .select('id')
      .single()

    if (error) fehler = error.message
    protokollId = data?.id ?? null
  } catch (err) {
    fehler = (err as Error).message
  }

  try {
    await logBillingAction(supabase, {
      entityType: 'dta_versand',
      organizationId: eintrag.organizationId,
      entityId: eintrag.dakotaAuftragId || eintrag.laufId || protokollId || eintrag.externeReferenz || 'unbekannt',
      action: `versand_${eintrag.phase}_${eintrag.ergebnis}`,
      newState: {
        kanal: eintrag.kanal,
        phase: eintrag.phase,
        ergebnis: eintrag.ergebnis,
        empfaenger_ik: eintrag.empfaengerIk ?? null,
        datei_hash: eintrag.dateiHash ?? null,
        datei_groesse: eintrag.dateiGroesseBytes ?? null,
        fehler_code: eintrag.fehlerCode ?? null,
        protokoll_id: protokollId,
        freigaben: freigabeStatus,
      },
      actorId: eintrag.actorId,
    })
  } catch (err) {
    // Audit-Fehler nicht verschlucken, aber auch nicht eskalieren: die
    // Protokollzeile ist bereits geschrieben und bleibt der Nachweis.
    fehler = fehler ? `${fehler}; Audit: ${(err as Error).message}` : `Audit: ${(err as Error).message}`
  }

  return { protokollId, fehler }
}

export interface VersandProtokollZeile {
  id: string
  kanal: VersandKanal
  phase: VersandPhase
  ergebnis: VersandErgebnis
  laufId: string | null
  dakotaAuftragId: string | null
  protokoll: string | null
  fehlerCode: string | null
  fehlerMeldung: string | null
  dateiName: string | null
  dateiHash: string | null
  dateiGroesseBytes: number | null
  empfaengerIk: string | null
  zielHost: string | null
  dauerMs: number | null
  createdAt: string
}

/** Protokollzeilen für die Anzeige, neueste zuerst. */
export async function ladeVersandProtokoll(
  supabase: SupabaseClient,
  organizationId: string,
  filter?: { laufId?: string; dakotaAuftragId?: string; kanal?: VersandKanal; limit?: number },
): Promise<VersandProtokollZeile[]> {
  let query = supabase
    .from('dta_versand_protokoll')
    .select('id, kanal, phase, ergebnis, lauf_id, dakota_auftrag_id, protokoll, fehler_code, fehler_meldung, datei_name, datei_hash, datei_groesse_bytes, empfaenger_ik, ziel_host, dauer_ms, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(Math.min(filter?.limit ?? 100, 500))

  if (filter?.laufId) query = query.eq('lauf_id', filter.laufId)
  if (filter?.dakotaAuftragId) query = query.eq('dakota_auftrag_id', filter.dakotaAuftragId)
  if (filter?.kanal) query = query.eq('kanal', filter.kanal)

  const { data } = await query

  return (data ?? []).map(z => ({
    id: z.id,
    kanal: z.kanal,
    phase: z.phase,
    ergebnis: z.ergebnis,
    laufId: z.lauf_id,
    dakotaAuftragId: z.dakota_auftrag_id,
    protokoll: z.protokoll,
    fehlerCode: z.fehler_code,
    fehlerMeldung: z.fehler_meldung,
    dateiName: z.datei_name,
    dateiHash: z.datei_hash,
    dateiGroesseBytes: z.datei_groesse_bytes,
    empfaengerIk: z.empfaenger_ik,
    zielHost: z.ziel_host,
    dauerMs: z.dauer_ms,
    createdAt: z.created_at,
  }))
}
