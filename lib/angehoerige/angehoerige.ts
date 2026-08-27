import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AngehoerigenZugang,
  AngehoerigenNachricht,
  AngehoerigenAuditLog,
  AngehoerigenBenachrichtigung,
  ZugangFilter,
  NachrichtFilter,
  AuditFilter,
  FreigabeBereich,
  FreigabeStatus,
  AuditAktion,
} from './types'
import { validiereZugangInput, validiereBereiche } from './types'

// ── Zugang CRUD ──────────────────────────────────────────────────

export async function listeZugaenge(
  sb: SupabaseClient,
  orgId: string,
  filter: ZugangFilter = {},
): Promise<AngehoerigenZugang[]> {
  let q = sb
    .from('angehoerigen_zugaenge')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.client_id) q = q.eq('client_id', filter.client_id)
  if (filter.user_id) q = q.eq('user_id', filter.user_id)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.rolle) q = q.eq('rolle', filter.rolle)

  const { data, error } = await q
  if (error) throw new Error(`Zugänge laden: ${error.message}`)
  return (data ?? []) as AngehoerigenZugang[]
}

export async function holeZugang(
  sb: SupabaseClient,
  orgId: string,
  id: string,
): Promise<AngehoerigenZugang | null> {
  const { data, error } = await sb
    .from('angehoerigen_zugaenge')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Zugang laden: ${error.message}`)
  return data as AngehoerigenZugang | null
}

export async function erstelleZugang(
  sb: SupabaseClient,
  orgId: string,
  adminUserId: string,
  data: Record<string, unknown>,
): Promise<AngehoerigenZugang> {
  validiereZugangInput(data)

  const row = {
    organization_id: orgId,
    user_id: data.user_id,
    client_id: data.client_id,
    rolle: data.rolle,
    status: 'aktiv' as FreigabeStatus,
    freigegebene_bereiche: data.freigegebene_bereiche,
    pflegeberichte_freigegeben: !!data.pflegeberichte_freigegeben,
    erteilt_von: adminUserId,
    erteilt_am: new Date().toISOString(),
    gueltig_bis: (data.gueltig_bis as string) || null,
  }

  const { data: created, error } = await sb
    .from('angehoerigen_zugaenge')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Zugang erstellen: ${error.message}`)
  return created as AngehoerigenZugang
}

export async function widerrufeZugang(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  adminUserId: string,
  grund?: string,
): Promise<AngehoerigenZugang> {
  // Compare-and-Swap auf `status='aktiv'`: zwei gleichzeitige Widerrufe
  // hätten sonst beide „erfolgreich" gemeldet und der zweite hätte
  // Grund und Zeitpunkt des ersten überschrieben — im Nachweis stünde
  // dann der falsche Vorgang.
  const { data, error } = await sb
    .from('angehoerigen_zugaenge')
    .update({
      status: 'widerrufen' as FreigabeStatus,
      widerrufen_von: adminUserId,
      widerrufen_am: new Date().toISOString(),
      widerruf_grund: grund || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('status', 'aktiv')
    .select()
    .maybeSingle()
  if (error) throw new Error(`Zugang widerrufen: ${error.message}`)
  if (!data) throw new Error('Zugang nicht gefunden oder bereits widerrufen.')
  return data as AngehoerigenZugang
}

/**
 * Hebt einen Widerruf wieder auf.
 *
 * BEFUND (27.08.2026): Ein widerrufener Zugang war eine Sackgasse. Der
 * Unique-Index `unique_user_client` verhindert einen zweiten Zugang für
 * dasselbe Paar (user_id, client_id), und es gab keinen Weg zurück —
 * ein versehentlicher Widerruf sperrte den Angehörigen dauerhaft aus,
 * ohne dass die Oberfläche das erklärt hätte (der neue Anlegeversuch
 * kam als HTTP 500 mit roher Postgres-Meldung zurück).
 *
 * Die Bereichsliste muss neu angegeben werden: der Umfang von damals
 * still wieder in Kraft zu setzen, wäre genau die Art stiller
 * Rechteerweiterung, die dieses Modul verhindern soll.
 */
export async function reaktiviereZugang(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  bereiche: string[] | undefined,
  pflegeberichteFreigegeben: boolean,
  gueltigBis: string | null,
): Promise<AngehoerigenZugang> {
  validiereBereiche((bereiche ?? []) as string[])

  const { data, error } = await sb
    .from('angehoerigen_zugaenge')
    .update({
      status: 'aktiv' as FreigabeStatus,
      freigegebene_bereiche: bereiche,
      pflegeberichte_freigegeben: pflegeberichteFreigegeben,
      gueltig_bis: gueltigBis,
      widerrufen_von: null,
      widerrufen_am: null,
      widerruf_grund: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .neq('status', 'aktiv')
    .select()
    .maybeSingle()
  if (error) throw new Error(`Zugang reaktivieren: ${error.message}`)
  if (!data) throw new Error('Zugang nicht gefunden oder bereits aktiv.')
  return data as AngehoerigenZugang
}

export async function aktualisiereFreigaben(
  sb: SupabaseClient,
  orgId: string,
  id: string,
  bereiche: FreigabeBereich[],
  pflegeberichteFreigegeben: boolean,
): Promise<AngehoerigenZugang> {
  validiereBereiche(bereiche)

  // Nur ein AKTIVER Zugang lässt sich in seinen Freigaben ändern.
  // Vorher liess sich ein widerrufener Zugang weiter umkonfigurieren —
  // ein Widerruf, der sich per Freigabe-Update aushebeln lässt, ist
  // kein Widerruf. Die Reaktivierung ist der ausdrückliche Weg zurück.
  const { data, error } = await sb
    .from('angehoerigen_zugaenge')
    .update({
      freigegebene_bereiche: bereiche,
      pflegeberichte_freigegeben: pflegeberichteFreigegeben,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('status', 'aktiv')
    .select()
    .maybeSingle()
  if (error) throw new Error(`Freigaben aktualisieren: ${error.message}`)
  if (!data) throw new Error('Zugang nicht gefunden oder nicht aktiv.')
  return data as AngehoerigenZugang
}

export function istZugangGueltig(zugang: AngehoerigenZugang): boolean {
  if (zugang.status !== 'aktiv') return false
  if (zugang.gueltig_bis && new Date(zugang.gueltig_bis) < new Date()) return false
  return true
}

export function hatBereichZugriff(
  zugang: AngehoerigenZugang,
  bereich: FreigabeBereich,
): boolean {
  if (!istZugangGueltig(zugang)) return false
  if (bereich === 'pflegeberichte' && !zugang.pflegeberichte_freigegeben) return false
  return zugang.freigegebene_bereiche.includes(bereich)
}

// ── Nachrichten ──────────────────────────────────────────────────

export async function listeNachrichten(
  sb: SupabaseClient,
  orgId: string,
  filter: NachrichtFilter = {},
): Promise<AngehoerigenNachricht[]> {
  let q = sb
    .from('angehoerigen_nachrichten')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.zugang_id) q = q.eq('zugang_id', filter.zugang_id)
  if (filter.client_id) q = q.eq('client_id', filter.client_id)
  if (filter.absender_typ) q = q.eq('absender_typ', filter.absender_typ)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Nachrichten laden: ${error.message}`)
  return (data ?? []) as AngehoerigenNachricht[]
}

export async function sendeNachricht(
  sb: SupabaseClient,
  orgId: string,
  nachricht: {
    zugang_id: string
    client_id: string
    absender_id: string
    absender_typ: 'angehoeriger' | 'pflegedienst'
    betreff: string
    inhalt: string
  },
): Promise<AngehoerigenNachricht> {
  if (!nachricht.betreff?.trim()) throw new Error('Betreff ist ein Pflichtfeld.')
  if (!nachricht.inhalt?.trim()) throw new Error('Nachrichteninhalt ist ein Pflichtfeld.')

  const { data, error } = await sb
    .from('angehoerigen_nachrichten')
    .insert({
      organization_id: orgId,
      zugang_id: nachricht.zugang_id,
      client_id: nachricht.client_id,
      absender_id: nachricht.absender_id,
      absender_typ: nachricht.absender_typ,
      betreff: nachricht.betreff.trim(),
      inhalt: nachricht.inhalt.trim(),
      status: 'gesendet' as const,
    })
    .select()
    .single()
  if (error) throw new Error(`Nachricht senden: ${error.message}`)
  return data as AngehoerigenNachricht
}

export async function markiereAlsGelesen(
  sb: SupabaseClient,
  orgId: string,
  nachrichtId: string,
): Promise<void> {
  const { error } = await sb
    .from('angehoerigen_nachrichten')
    .update({ status: 'gelesen', gelesen_am: new Date().toISOString() })
    .eq('id', nachrichtId)
    .eq('organization_id', orgId)
  if (error) throw new Error(`Nachricht als gelesen markieren: ${error.message}`)
}

// ── Audit-Log ───────────────────────────────────────────────────

export async function protokolliereZugriff(
  sb: SupabaseClient,
  orgId: string,
  eintrag: {
    zugang_id: string
    user_id: string
    client_id: string
    aktion: AuditAktion
    details?: Record<string, unknown>
    ip_adresse?: string
    user_agent?: string
  },
): Promise<void> {
  const { error } = await sb
    .from('angehoerigen_audit_log')
    .insert({
      organization_id: orgId,
      zugang_id: eintrag.zugang_id,
      user_id: eintrag.user_id,
      client_id: eintrag.client_id,
      aktion: eintrag.aktion,
      details: eintrag.details || null,
      ip_adresse: eintrag.ip_adresse || null,
      user_agent: eintrag.user_agent || null,
    })
  if (error) throw new Error(`Audit-Log schreiben: ${error.message}`)
}

export async function listeAuditLog(
  sb: SupabaseClient,
  orgId: string,
  filter: AuditFilter = {},
): Promise<AngehoerigenAuditLog[]> {
  let q = sb
    .from('angehoerigen_audit_log')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.zugang_id) q = q.eq('zugang_id', filter.zugang_id)
  if (filter.client_id) q = q.eq('client_id', filter.client_id)
  if (filter.user_id) q = q.eq('user_id', filter.user_id)
  if (filter.aktion) q = q.eq('aktion', filter.aktion)
  if (filter.von) q = q.gte('created_at', filter.von)
  if (filter.bis) q = q.lte('created_at', filter.bis)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Audit-Log laden: ${error.message}`)
  return (data ?? []) as AngehoerigenAuditLog[]
}

// ── Benachrichtigungen ──────────────────────────────────────────

export async function erstelleBenachrichtigung(
  sb: SupabaseClient,
  orgId: string,
  benachrichtigung: {
    zugang_id: string
    typ: 'push' | 'email'
    betreff: string
    inhalt: string
  },
): Promise<AngehoerigenBenachrichtigung> {
  const { data, error } = await sb
    .from('angehoerigen_benachrichtigungen')
    .insert({
      organization_id: orgId,
      zugang_id: benachrichtigung.zugang_id,
      typ: benachrichtigung.typ,
      betreff: benachrichtigung.betreff,
      inhalt: benachrichtigung.inhalt,
    })
    .select()
    .single()
  if (error) throw new Error(`Benachrichtigung erstellen: ${error.message}`)
  return data as AngehoerigenBenachrichtigung
}
