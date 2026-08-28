import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  NACHRICHTEN_PRIORITAET_WERTE,
  NACHRICHTEN_KATEGORIE_WERTE,
  type OpsNachricht,
  type OpsNachrichtEmpfaenger,
  type OpsPosteingang,
  type ListPosteingangFilter,
} from './types'

/**
 * Wirft bei fehlenden Pflichtfeldern oder ungueltigen Enum-Werten.
 * Empfaenger sind absichtlich NICHT Pflicht — System-/Ankuendigungs-
 * Nachrichten koennen ohne individuelle Empfaenger angelegt werden
 * (siehe __tests__/ops/nachrichten.test.ts "erstellt Nachricht ohne Empfaenger").
 */
function assertNachrichtGueltig(
  data: Omit<OpsNachricht, 'id' | 'organization_id' | 'created_at' | 'eltern_id'>,
  empfaengerIds: string[],
): void {
  if (!data.betreff?.trim()) throw new UserFacingError('Betreff ist ein Pflichtfeld.')
  if (!data.inhalt?.trim()) throw new UserFacingError('Inhalt ist ein Pflichtfeld.')
  if (!data.absender_id?.trim()) throw new UserFacingError('Absender ist ein Pflichtfeld.')
  if (!Array.isArray(empfaengerIds)) {
    throw new UserFacingError('Empfaenger muessen als Liste uebergeben werden.')
  }
  assertErlaubt(data.prioritaet, NACHRICHTEN_PRIORITAET_WERTE, 'prioritaet')
  assertErlaubt(data.kategorie, NACHRICHTEN_KATEGORIE_WERTE, 'kategorie')
}

/**
 * Mandantenschutz für Empfänger-IDs aus dem Request-Body (app/admin/nachrichten,
 * app/engel/nachrichten übergeben sie als frei eingetragene UUID-Liste).
 * Läuft über Service-Role (createAdminClient) — RLS greift hier NICHT, ohne
 * diese Prüfung könnte eine Nachricht Empfänger einer fremden Organisation
 * referenzieren (organization_id der Zeile bliebe trotzdem die des Absenders).
 */
async function assertEmpfaengerGehoerenZuOrg(
  supabase: SupabaseClient,
  empfaengerIds: string[],
  organizationId: string,
): Promise<void> {
  const eindeutig = [...new Set(empfaengerIds)]
  if (eindeutig.length === 0) return

  const [mitglieder, caregivers] = await Promise.all([
    supabase.from('organization_members').select('user_id').eq('organization_id', organizationId).in('user_id', eindeutig),
    supabase.from('caregivers').select('user_id').eq('organization_id', organizationId).in('user_id', eindeutig),
  ])
  if (mitglieder.error) throw new Error(`Empfänger konnten nicht geprüft werden: ${mitglieder.error.message}`)
  if (caregivers.error) throw new Error(`Empfänger konnten nicht geprüft werden: ${caregivers.error.message}`)

  const bekannt = new Set([
    ...(mitglieder.data ?? []).map((m: { user_id: string }) => m.user_id),
    ...(caregivers.data ?? []).map((c: { user_id: string }) => c.user_id),
  ])
  const unbekannt = eindeutig.filter(id => !bekannt.has(id))
  if (unbekannt.length > 0) {
    throw new UserFacingError('Ein oder mehrere Empfänger gehören nicht zu dieser Organisation.')
  }
}

/**
 * Ist der Nutzer an DIESEM Nachrichtenverlauf beteiligt?
 *
 * BEFUND (Track 10): `createAntwort` pruefte bisher nur, ob die
 * Eltern-Nachricht existiert UND zur Organisation gehoert. Wer an dem
 * Verlauf beteiligt ist, wurde nicht gefragt — obwohl `getNachricht` fuer
 * das LESEN genau das verlangt (`isSender || isRecipient`, sonst null).
 * Lesen und Schreiben beantworteten dieselbe Frage also verschieden.
 *
 * Die Wirkung: jedes angemeldete Konto der Organisation — einschliesslich
 * `kunde` und `angehoerige`, die ueber `resolveUserOrgId()` ihre Org aus
 * `clients` bekommen — konnte mit einer bekannten oder erratenen
 * Nachrichten-UUID eine Antwort in einen fremden internen Verlauf
 * schreiben. Die Antwort erscheint bei jedem echten Beteiligten unter
 * `GET /api/ops/nachrichten/[id]` als Teil des Verlaufs, mit aufgeloestem
 * Absendernamen aus `profiles`; ueber `empfaenger_ids` liess sie sich
 * zusaetzlich in beliebige Postfaecher der Organisation legen.
 *
 * Beteiligt ist, wer Absender oder Empfaenger IRGENDEINER Nachricht des
 * Verlaufs ist — nicht nur der unmittelbaren Eltern-Nachricht. Sonst
 * koennte jemand, der berechtigt auf eine Antwort geantwortet hat, in
 * derselben Kette weiter unten ausgesperrt werden.
 *
 * Fail-closed: Datenbankfehler werden geworfen, nicht als „nicht
 * beteiligt" oder „beteiligt" gedeutet.
 */
export async function istThreadTeilnehmer(
  supabase: SupabaseClient,
  params: { organizationId: string; nachrichtId: string; userId: string },
): Promise<boolean> {
  if (!params.userId?.trim() || !params.nachrichtId?.trim()) return false

  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .select('id, absender_id, eltern_id')
    .eq('organization_id', params.organizationId)
    .eq('id', params.nachrichtId)
    .maybeSingle()
  if (nErr) throw new Error(`Nachrichtenverlauf konnte nicht geprueft werden: ${nErr.message}`)
  if (!nachricht) return false

  // Antworten tragen eltern_id, die Wurzel selbst nicht.
  const wurzelId = (nachricht as { eltern_id: string | null }).eltern_id ?? (nachricht as { id: string }).id

  const { data: wurzel, error: wErr } = await supabase
    .from('ops_nachrichten')
    .select('id, absender_id')
    .eq('organization_id', params.organizationId)
    .eq('id', wurzelId)
    .maybeSingle()
  if (wErr) throw new Error(`Nachrichtenverlauf konnte nicht geprueft werden: ${wErr.message}`)
  if (!wurzel) return false

  const { data: antworten, error: aErr } = await supabase
    .from('ops_nachrichten')
    .select('id, absender_id')
    .eq('organization_id', params.organizationId)
    .eq('eltern_id', wurzelId)
  if (aErr) throw new Error(`Nachrichtenverlauf konnte nicht geprueft werden: ${aErr.message}`)

  // Array.isArray statt `?? []`: PostgREST liefert bei einer Listenabfrage
  // immer ein Array, ein Doppelgaenger im Test aber nicht zwingend — und ein
  // `for…of` ueber ein Objekt waere hier ein TypeError mitten im
  // Berechtigungspfad statt einer klaren Antwort.
  const antwortListe = Array.isArray(antworten) ? (antworten as { id: string; absender_id: string }[]) : []
  const knoten = [wurzel as { id: string; absender_id: string }, ...antwortListe]
  if (knoten.some(k => k.absender_id === params.userId)) return true

  const { data: empfaenger, error: eErr } = await supabase
    .from('ops_nachrichten_empfaenger')
    .select('nachricht_id')
    .eq('organization_id', params.organizationId)
    .eq('empfaenger_id', params.userId)
    .in('nachricht_id', knoten.map(k => k.id))
    .limit(1)
  if (eErr) throw new Error(`Nachrichtenverlauf konnte nicht geprueft werden: ${eErr.message}`)

  return Array.isArray(empfaenger) && empfaenger.length > 0
}

export async function listPosteingang(
  supabase: SupabaseClient,
  filter: ListPosteingangFilter,
): Promise<OpsPosteingang[]> {
  const { data, error } = await supabase
    .from('ops_posteingang')
    .select('*')
    .eq('empfaenger_id', filter.empfaengerId)
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Posteingang konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsPosteingang[]
}

export async function getNachricht(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; userId?: string },
): Promise<{ nachricht: OpsNachricht; empfaenger: OpsNachrichtEmpfaenger[] } | null> {
  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (nErr) throw new Error(`Nachricht konnte nicht geladen werden: ${nErr.message}`)
  if (!nachricht) return null

  const { data: empfaenger, error: eErr } = await supabase
    .from('ops_nachrichten_empfaenger')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('nachricht_id', params.id)
  if (eErr) throw new Error(`Nachricht-Empfaenger konnten nicht geladen werden: ${eErr.message}`)

  if (params.userId) {
    const isSender = (nachricht as OpsNachricht).absender_id === params.userId
    const isRecipient = (empfaenger ?? []).some((e: any) => e.empfaenger_id === params.userId)
    if (!isSender && !isRecipient) return null
  }

  return { nachricht: nachricht as OpsNachricht, empfaenger: (empfaenger ?? []) as OpsNachrichtEmpfaenger[] }
}

export async function createNachricht(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    data: Omit<OpsNachricht, 'id' | 'organization_id' | 'created_at' | 'eltern_id'>
    empfaengerIds: string[]
  },
): Promise<OpsNachricht> {
  assertNachrichtGueltig(params.data, params.empfaengerIds)
  await assertEmpfaengerGehoerenZuOrg(supabase, params.empfaengerIds, params.organizationId)
  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .insert({ ...params.data, betreff: params.data.betreff.trim(), inhalt: params.data.inhalt.trim(), organization_id: params.organizationId })
    .select('*')
    .single()
  if (nErr || !nachricht) throw new Error(`Nachricht konnte nicht erstellt werden: ${nErr?.message ?? 'unbekannt'}`)

  if (params.empfaengerIds.length > 0) {
    const empfaengerRows = params.empfaengerIds.map((empfaengerId) => ({
      organization_id: params.organizationId,
      nachricht_id: nachricht.id,
      empfaenger_id: empfaengerId,
    }))
    const { error: eErr } = await supabase.from('ops_nachrichten_empfaenger').insert(empfaengerRows)
    if (eErr) throw new Error(`Nachricht-Empfaenger konnten nicht erstellt werden: ${eErr.message}`)
  }

  return nachricht as OpsNachricht
}

export async function createAntwort(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    elternId: string
    data: Omit<OpsNachricht, 'id' | 'organization_id' | 'created_at' | 'eltern_id'>
    empfaengerIds: string[]
  },
): Promise<OpsNachricht> {
  const { data: parent, error: pErr } = await supabase
    .from('ops_nachrichten')
    .select('id')
    .eq('id', params.elternId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (pErr || !parent) throw new UserFacingError('Eltern-Nachricht nicht gefunden oder gehoert nicht zur Organisation.')

  // Beteiligung am Verlauf ist Voraussetzung fuer eine Antwort — dieselbe
  // Frage, die getNachricht() fuer das Lesen stellt. Siehe die Begruendung
  // an istThreadTeilnehmer().
  if (!(await istThreadTeilnehmer(supabase, {
    organizationId: params.organizationId,
    nachrichtId: params.elternId,
    userId: params.data.absender_id,
  }))) {
    throw new UserFacingError('Sie sind an diesem Nachrichtenverlauf nicht beteiligt.', 403)
  }

  assertNachrichtGueltig(params.data, params.empfaengerIds)
  await assertEmpfaengerGehoerenZuOrg(supabase, params.empfaengerIds, params.organizationId)

  const { data: nachricht, error: nErr } = await supabase
    .from('ops_nachrichten')
    .insert({
      ...params.data,
      betreff: params.data.betreff.trim(),
      inhalt: params.data.inhalt.trim(),
      organization_id: params.organizationId,
      eltern_id: params.elternId,
    })
    .select('*')
    .single()
  if (nErr || !nachricht) throw new Error(`Antwort konnte nicht erstellt werden: ${nErr?.message ?? 'unbekannt'}`)

  if (params.empfaengerIds.length > 0) {
    const empfaengerRows = params.empfaengerIds.map((empfaengerId) => ({
      organization_id: params.organizationId,
      nachricht_id: nachricht.id,
      empfaenger_id: empfaengerId,
    }))
    const { error: eErr } = await supabase.from('ops_nachrichten_empfaenger').insert(empfaengerRows)
    if (eErr) throw new Error(`Antwort-Empfaenger konnten nicht erstellt werden: ${eErr.message}`)
  }

  return nachricht as OpsNachricht
}

export async function markGelesen(
  supabase: SupabaseClient,
  params: { organizationId: string; nachrichtId: string; empfaengerId: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_nachrichten_empfaenger')
    .update({ gelesen: true, gelesen_am: new Date().toISOString() })
    .eq('organization_id', params.organizationId)
    .eq('nachricht_id', params.nachrichtId)
    .eq('empfaenger_id', params.empfaengerId)
  if (error) throw new Error(`Nachricht konnte nicht als gelesen markiert werden: ${error.message}`)
}
