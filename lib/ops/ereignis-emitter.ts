import type { SupabaseClient } from '@supabase/supabase-js'
import type { EreignisTyp, BenachrichtigungKategorie } from './types'
import { logAktivitaet } from './aktivitaetslog'
import { logger } from '@/lib/logger'
const slog = logger.child('ops')

/** Ergebnis eines Ereignis-Emits — wird von der API-Route direkt zurueckgegeben. */
export interface EreignisErgebnis {
  /** Anzahl der angewandten aktiven Regeln. */
  regeln: number
  /** Anzahl tatsaechlich erzeugter Benachrichtigungen. */
  benachrichtigungen: number
  /** Id des Aktivitaetslog-Eintrags, oder null wenn das Protokollieren fehlschlug. */
  log_id: string | null
}

export async function emitEreignis(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    ereignisTyp: EreignisTyp
    entitaetId: string
    akteurId?: string
    kontext?: Record<string, unknown>
  },
): Promise<EreignisErgebnis> {
  const { data: regeln, error: regelErr } = await supabase
    .from('ops_ereignis_regeln')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('ereignis_typ', params.ereignisTyp)
    .eq('aktiv', true)

  if (regelErr) throw new Error(`Ereignisregeln konnten nicht geladen werden: ${regelErr.message}`)

  let benachrichtigungen = 0

  for (const regel of regeln ?? []) {
    const empfaengerIds = await resolveEmpfaenger(supabase, {
      organizationId: params.organizationId,
      empfaengerRolle: regel.empfaenger_rolle,
      empfaengerUserId: regel.empfaenger_user_id,
      kontext: params.kontext,
    })

    const titel = substituteVorlage(regel.titel_vorlage, params.kontext)
    const inhalt = substituteVorlage(regel.nachricht_vorlage, params.kontext)

    for (const empfaengerId of empfaengerIds) {
      const prefAllowed = await checkPraeferenz(supabase, {
        organizationId: params.organizationId,
        benutzerId: empfaengerId,
        kategorie: regel.kategorie,
      })
      if (!prefAllowed) continue

      const { error: bErr } = await supabase.from('ops_benachrichtigungen').insert({
        organization_id: params.organizationId,
        empfaenger_id: empfaengerId,
        titel,
        inhalt,
        typ: mapEreignisZuBenachrichtigungTyp(params.ereignisTyp),
        kategorie: regel.kategorie as BenachrichtigungKategorie,
        bezug_typ: mapEreignisZuBezugTyp(params.ereignisTyp),
        bezug_id: params.entitaetId,
        email_gesendet: false,
        push_gesendet: false,
      })
      if (bErr) {
        slog.error(`Benachrichtigung fuer ${empfaengerId} fehlgeschlagen: ${bErr.message}`)
      } else {
        benachrichtigungen++
      }
    }
  }

  // Auch ohne passende Regel wird das Ereignis protokolliert — der
  // Aktivitaetslog soll luecken­los sein, nicht nur dort greifen, wo
  // zufaellig eine Benachrichtigungsregel konfiguriert ist.
  const log = await logAktivitaet(supabase, {
    organizationId: params.organizationId,
    entitaetTyp: 'benachrichtigung',
    entitaetId: params.entitaetId,
    aktion: 'gesendet',
    nachher: { ereignis_typ: params.ereignisTyp, kontext: params.kontext },
    akteurId: params.akteurId,
  }).catch((err) => {
    slog.error('Aktivitaetslog fuer Ereignis fehlgeschlagen', { errorMessage: String(err) })
    return null
  })

  return {
    regeln: regeln?.length ?? 0,
    benachrichtigungen,
    log_id: log?.id ?? null,
  }
}

/**
 * Mitglieder einer Organisation, deren Profil-Rolle passt.
 *
 * Bewusst zwei Queries statt eines PostgREST-Embeds: zwischen
 * organization_members und profiles existiert KEIN Foreign Key, ein
 * `profiles!inner(...)`-Embed scheitert daher mit PGRST200 und liefert
 * still eine leere Empfaengerliste — rollenbasierte Benachrichtigungen
 * waeren dann lautlos tot. Fehler werden hier deshalb protokolliert.
 *
 * organization_members.role (owner/member) ist NICHT die fachliche
 * Rolle — die steht in profiles.role (admin/superadmin/engel/...).
 */
async function mitgliederMitProfilrolle(
  supabase: SupabaseClient,
  organizationId: string,
  rollen: string[],
): Promise<string[]> {
  const { data: mitglieder, error: mErr } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)

  if (mErr) {
    slog.error('resolveEmpfaenger: organization_members fehlgeschlagen', { errorMessage: mErr.message })
    return []
  }

  const userIds = (mitglieder ?? []).map((m: any) => m.user_id).filter(Boolean)
  if (userIds.length === 0) return []

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .in('id', userIds)
    .in('role', rollen)
    .is('deleted_at', null)

  if (pErr) {
    slog.error('resolveEmpfaenger: profiles fehlgeschlagen', { errorMessage: pErr.message })
    return []
  }

  return (profile ?? []).map((p: any) => p.id)
}

async function resolveEmpfaenger(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    empfaengerRolle: string | null
    empfaengerUserId: string | null
    kontext?: Record<string, unknown>
  },
): Promise<string[]> {
  if (params.empfaengerUserId) {
    return [params.empfaengerUserId]
  }

  switch (params.empfaengerRolle) {
    case 'admin':
      return mitgliederMitProfilrolle(supabase, params.organizationId, ['admin'])
    case 'pdl':
      return mitgliederMitProfilrolle(supabase, params.organizationId, ['admin', 'superadmin'])
    case 'engel': {
      const caregiverId = params.kontext?.caregiver_user_id as string | undefined
      return caregiverId ? [caregiverId] : []
    }
    case 'verantwortlicher': {
      const verantwortlichId = params.kontext?.verantwortlich_id as string | undefined
      return verantwortlichId ? [verantwortlichId] : []
    }
    case 'alle': {
      const { data } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', params.organizationId)
      return (data ?? []).map((m: any) => m.user_id)
    }
    default:
      return []
  }
}

async function checkPraeferenz(
  supabase: SupabaseClient,
  params: { organizationId: string; benutzerId: string; kategorie: string },
): Promise<boolean> {
  const { data } = await supabase
    .from('ops_benachrichtigungs_praeferenzen')
    .select('in_app, aktiv')
    .eq('organization_id', params.organizationId)
    .eq('benutzer_id', params.benutzerId)
    .eq('kategorie', params.kategorie)
    .maybeSingle()

  // No preference record means default to enabled
  if (!data) return true
  return data.aktiv && data.in_app
}

/**
 * Ersetzt Platzhalter in einer Vorlage durch Kontext-Werte.
 * Akzeptiert `{key}` und `{{key}}`. Ein Platzhalter ohne passenden
 * Kontext-Wert bleibt unveraendert stehen.
 */
function substituteVorlage(vorlage: string, kontext?: Record<string, unknown>): string {
  if (!kontext) return vorlage
  return vorlage.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (treffer, doppelt, einfach) => {
    const key = doppelt ?? einfach
    const val = kontext[key]
    return val != null ? String(val) : treffer
  })
}

function mapEreignisZuBenachrichtigungTyp(ereignisTyp: EreignisTyp): string {
  if (ereignisTyp.includes('eskalation') || ereignisTyp.includes('eskaliert')) return 'eskalation'
  if (ereignisTyp.includes('fehler') || ereignisTyp.includes('storniert')) return 'warnung'
  if (ereignisTyp.includes('erledigt') || ereignisTyp.includes('genehmigt')) return 'erfolg'
  if (ereignisTyp.includes('faellig') || ereignisTyp.includes('ueberfaellig') || ereignisTyp.includes('abgelaufen')) return 'erinnerung'
  return 'info'
}

function mapEreignisZuBezugTyp(ereignisTyp: EreignisTyp): string | null {
  if (ereignisTyp.startsWith('aufgabe_')) return 'aufgabe'
  if (ereignisTyp.startsWith('wiedervorlage_')) return 'wiedervorlage'
  if (ereignisTyp.startsWith('nachricht_')) return 'nachricht'
  if (ereignisTyp.startsWith('einsatz_')) return 'einsatz'
  if (ereignisTyp.startsWith('dienstplan_')) return 'dienstplan'
  if (ereignisTyp.startsWith('urlaub_')) return 'urlaub'
  if (ereignisTyp.startsWith('qualifikation_')) return 'qualifikation'
  if (ereignisTyp.startsWith('dokument_')) return 'dokument'
  if (ereignisTyp.startsWith('abrechnung_')) return 'abrechnung'
  if (ereignisTyp.startsWith('pflege_')) return 'aufgabe'
  if (ereignisTyp.startsWith('eskalation_')) return 'aufgabe'
  return null
}
