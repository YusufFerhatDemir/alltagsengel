import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  EreignisTyp,
  OpsEreignisRegel,
  OpsBenachrichtigung,
  OpsAktivitaetslog,
} from './types'

export interface EmitEreignisParams {
  organizationId: string
  ereignisTyp: EreignisTyp
  entitaetId: string
  akteurId: string
  kontext?: Record<string, unknown>
}

export interface EmitEreignisResult {
  regeln: number
  benachrichtigungen: number
  log_id: string | null
}

/**
 * Emittiert ein Ereignis: laedt passende Regeln, erzeugt Benachrichtigungen
 * fuer die jeweiligen Empfaenger (unter Beruecksichtigung der Praeferenzen)
 * und protokolliert die Aktion im Aktivitaetslog.
 */
export async function emitEreignis(
  supabase: SupabaseClient,
  params: EmitEreignisParams,
): Promise<EmitEreignisResult> {
  // 1. Passende aktive Regeln laden
  const { data: regeln, error: rErr } = await supabase
    .from('ops_ereignis_regeln')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('ereignis_typ', params.ereignisTyp)
    .eq('aktiv', true)

  if (rErr) throw new Error(`Ereignisregeln konnten nicht geladen werden: ${rErr.message}`)

  const matchingRegeln = (regeln ?? []) as OpsEreignisRegel[]
  let benachrichtigungenCount = 0

  // 2. Fuer jede Regel Benachrichtigungen erzeugen
  for (const regel of matchingRegeln) {
    // Empfaenger bestimmen: entweder spezifischer User oder Rolle
    let empfaengerIds: string[] = []

    if (regel.empfaenger_user_id) {
      empfaengerIds = [regel.empfaenger_user_id]
    } else if (regel.empfaenger_rolle) {
      // Rolle-basierte Empfaenger aus profiles laden
      const { data: users } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', params.organizationId)
        .eq('role', regel.empfaenger_rolle)

      empfaengerIds = (users ?? []).map((u: { id: string }) => u.id)
    }

    // Praeferenzen pruefen und Benachrichtigungen erstellen
    for (const empfaengerId of empfaengerIds) {
      // Praeferenz laden
      const { data: praef } = await supabase
        .from('ops_benachrichtigungs_praeferenzen')
        .select('*')
        .eq('organization_id', params.organizationId)
        .eq('benutzer_id', empfaengerId)
        .eq('kategorie', regel.kategorie)
        .maybeSingle()

      // Wenn Praeferenz existiert und deaktiviert -> ueberspringen
      if (praef && !praef.aktiv) continue

      // Template-Variablen ersetzen
      const titel = regel.titel_vorlage.replace(
        /\{(\w+)\}/g,
        (_, key) => String((params.kontext as any)?.[key] ?? `{${key}}`),
      )
      const inhalt = regel.nachricht_vorlage.replace(
        /\{(\w+)\}/g,
        (_, key) => String((params.kontext as any)?.[key] ?? `{${key}}`),
      )

      const { error: bErr } = await supabase
        .from('ops_benachrichtigungen')
        .insert({
          organization_id: params.organizationId,
          empfaenger_id: empfaengerId,
          titel,
          inhalt,
          typ: 'info',
          kategorie: regel.kategorie,
          bezug_typ: 'aufgabe',
          bezug_id: params.entitaetId,
          email_gesendet: praef?.email ?? false,
          push_gesendet: praef?.push ?? false,
        })

      if (!bErr) benachrichtigungenCount++
    }
  }

  // 3. Aktivitaetslog-Eintrag
  let logId: string | null = null
  const { data: logEntry, error: lErr } = await supabase
    .from('ops_aktivitaetslog')
    .insert({
      organization_id: params.organizationId,
      entitaet_typ: 'ereignis_regel',
      entitaet_id: params.entitaetId,
      aktion: 'erstellt',
      nachher: {
        ereignis_typ: params.ereignisTyp,
        regeln_getroffen: matchingRegeln.length,
        benachrichtigungen_erstellt: benachrichtigungenCount,
        ...params.kontext,
      },
      akteur_id: params.akteurId,
    })
    .select('id')
    .single()

  if (!lErr && logEntry) logId = logEntry.id

  return {
    regeln: matchingRegeln.length,
    benachrichtigungen: benachrichtigungenCount,
    log_id: logId,
  }
}
