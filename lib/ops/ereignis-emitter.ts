import type { SupabaseClient } from '@supabase/supabase-js'
import type { EreignisTyp, BenachrichtigungKategorie } from './types'
import { logAktivitaet } from './aktivitaetslog'

export async function emitEreignis(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    ereignisTyp: EreignisTyp
    entitaetId: string
    akteurId?: string
    kontext?: Record<string, unknown>
  },
): Promise<void> {
  const { data: regeln, error: regelErr } = await supabase
    .from('ops_ereignis_regeln')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('ereignis_typ', params.ereignisTyp)
    .eq('aktiv', true)

  if (regelErr) throw new Error(`Ereignisregeln konnten nicht geladen werden: ${regelErr.message}`)
  if (!regeln || regeln.length === 0) return

  for (const regel of regeln) {
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
        console.error(`Benachrichtigung fuer ${empfaengerId} fehlgeschlagen: ${bErr.message}`)
      }
    }
  }

  await logAktivitaet(supabase, {
    organizationId: params.organizationId,
    entitaetTyp: 'benachrichtigung',
    entitaetId: params.entitaetId,
    aktion: 'gesendet',
    nachher: { ereignis_typ: params.ereignisTyp, kontext: params.kontext },
    akteurId: params.akteurId,
  }).catch((err) => {
    console.error(`Aktivitaetslog fuer Ereignis fehlgeschlagen: ${err}`)
  })
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
    case 'admin': {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', params.organizationId)
        .eq('role', 'admin')
      return (data ?? []).map((p) => p.id)
    }
    case 'pdl': {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', params.organizationId)
        .in('role', ['admin', 'superadmin'])
      return (data ?? []).map((p) => p.id)
    }
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
        .from('profiles')
        .select('id')
        .eq('organization_id', params.organizationId)
      return (data ?? []).map((p) => p.id)
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

function substituteVorlage(vorlage: string, kontext?: Record<string, unknown>): string {
  if (!kontext) return vorlage
  return vorlage.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = kontext[key]
    return val != null ? String(val) : `{{${key}}}`
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
