import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  SignaturDokument,
  Signatur,
  SignaturAuditLog,
  DokumentFilter,
  SignaturFilter,
  SignaturAuditFilter,
  SignaturStatus,
  SignaturMethode,
  AuditAktionTyp,
} from './types'
import {
  validiereDokumentInput,
  validiereSignaturInput,
  validiereSHA256,
  validiereMethode,
} from './types'
import { createHash } from 'crypto'

// ── Hash-Hilfsfunktionen ────────────────────────────────────────

export function berechneSHA256(inhalt: string): string {
  return createHash('sha256').update(inhalt, 'utf8').digest('hex')
}

export function verifiziereDokumentHash(
  inhalt: string,
  erwarteterHash: string,
): boolean {
  const berechnet = berechneSHA256(inhalt)
  return berechnet === erwarteterHash
}

export function berechneSignaturHash(
  dokumentHash: string,
  signatarId: string,
  zeitstempel: string,
): string {
  const payload = `${dokumentHash}:${signatarId}:${zeitstempel}`
  return berechneSHA256(payload)
}

// ── Dokument CRUD ───────────────────────────────────────────────

export async function listeDokumente(
  sb: SupabaseClient,
  orgId: string,
  filter: DokumentFilter = {},
): Promise<SignaturDokument[]> {
  let q = sb
    .from('signatur_dokumente')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.dokument_typ) q = q.eq('dokument_typ', filter.dokument_typ)
  if (filter.referenz_tabelle) q = q.eq('referenz_tabelle', filter.referenz_tabelle)
  if (filter.referenz_id) q = q.eq('referenz_id', filter.referenz_id)
  if (filter.erstellt_von) q = q.eq('erstellt_von', filter.erstellt_von)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Signaturdokumente laden: ${error.message}`)
  return (data ?? []) as SignaturDokument[]
}

export async function holeDokument(
  sb: SupabaseClient,
  orgId: string,
  id: string,
): Promise<SignaturDokument | null> {
  const { data, error } = await sb
    .from('signatur_dokumente')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) throw new Error(`Signaturdokument laden: ${error.message}`)
  return data as SignaturDokument | null
}

export async function erstelleDokument(
  sb: SupabaseClient,
  orgId: string,
  userId: string,
  input: Record<string, unknown>,
): Promise<SignaturDokument> {
  validiereDokumentInput(input)

  const inhaltSnapshot = (input.dokument_inhalt_snapshot as string) || null
  if (inhaltSnapshot && input.dokument_hash_sha256) {
    if (!verifiziereDokumentHash(inhaltSnapshot, input.dokument_hash_sha256 as string)) {
      throw new Error('Dokument-Hash stimmt nicht mit dem Inhalt überein.')
    }
  }

  const row = {
    organization_id: orgId,
    dokument_typ: input.dokument_typ,
    titel: (input.titel as string).trim(),
    beschreibung: (input.beschreibung as string)?.trim() || null,
    referenz_tabelle: (input.referenz_tabelle as string) || null,
    referenz_id: (input.referenz_id as string) || null,
    dokument_hash_sha256: input.dokument_hash_sha256,
    dokument_inhalt_snapshot: inhaltSnapshot,
    erstellt_von: userId,
    version: 1,
  }

  const { data, error } = await sb
    .from('signatur_dokumente')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Signaturdokument erstellen: ${error.message}`)

  await protokolliereSignaturAudit(sb, orgId, {
    dokument_id: (data as SignaturDokument).id,
    aktion: 'dokument_erstellt',
    akteur_id: userId,
    details: { dokument_typ: input.dokument_typ, titel: input.titel },
  })

  return data as SignaturDokument
}

// ── Signatur CRUD ───────────────────────────────────────────────

export async function listeSignaturen(
  sb: SupabaseClient,
  orgId: string,
  filter: SignaturFilter = {},
): Promise<Signatur[]> {
  let q = sb
    .from('signaturen')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.dokument_id) q = q.eq('dokument_id', filter.dokument_id)
  if (filter.signatar_id) q = q.eq('signatar_id', filter.signatar_id)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.methode) q = q.eq('methode', filter.methode)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Signaturen laden: ${error.message}`)
  return (data ?? []) as Signatur[]
}

export async function fordereSignaturAn(
  sb: SupabaseClient,
  orgId: string,
  adminUserId: string,
  input: Record<string, unknown>,
): Promise<Signatur> {
  validiereSignaturInput(input)

  // Mandantenschutz: das Dokument muss zur aktiven Organisation gehören.
  const { data: dokument } = await sb
    .from('signatur_dokumente')
    .select('id')
    .eq('id', input.dokument_id as string)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (!dokument) {
    throw new Error('Dokument nicht gefunden oder gehört nicht zur Organisation.')
  }

  const row = {
    organization_id: orgId,
    dokument_id: input.dokument_id,
    signatar_id: input.signatar_id,
    signatar_name: (input.signatar_name as string).trim(),
    signatar_rolle: (input.signatar_rolle as string)?.trim() || null,
    status: 'offen' as SignaturStatus,
  }

  const { data, error } = await sb
    .from('signaturen')
    .insert(row)
    .select()
    .single()
  if (error) throw new Error(`Signatur anfordern: ${error.message}`)

  await protokolliereSignaturAudit(sb, orgId, {
    dokument_id: input.dokument_id as string,
    signatur_id: (data as Signatur).id,
    aktion: 'signatur_angefordert',
    akteur_id: adminUserId,
    details: { signatar_name: input.signatar_name },
  })

  return data as Signatur
}

export async function leisteSignatur(
  sb: SupabaseClient,
  orgId: string,
  signaturId: string,
  signatarId: string,
  input: {
    methode: SignaturMethode
    signatur_daten?: string
    ip_adresse?: string
    user_agent?: string
  },
): Promise<Signatur> {
  validiereMethode(input.methode)

  const signatur = await sb
    .from('signaturen')
    .select('*, signatur_dokumente!inner(dokument_hash_sha256)')
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .single()

  if (signatur.error || !signatur.data) {
    throw new Error('Signatur nicht gefunden.')
  }
  if (signatur.data.status !== 'offen') {
    throw new Error(`Signatur hat Status "${signatur.data.status}" — kann nicht signiert werden.`)
  }
  if (signatur.data.signatar_id !== signatarId) {
    throw new Error('Nur der zugewiesene Signatar kann signieren.')
  }

  const zeitstempel = new Date().toISOString()
  const joinedDoc = signatur.data.signatur_dokumente as unknown as { dokument_hash_sha256: string } | null
  const dokumentHash = joinedDoc?.dokument_hash_sha256 ?? ''
  if (!dokumentHash) throw new Error('Dokument-Hash fehlt — Signatur kann nicht berechnet werden.')
  const signaturHash = berechneSignaturHash(dokumentHash, signatarId, zeitstempel)

  const { data, error } = await sb
    .from('signaturen')
    .update({
      status: 'signiert' as SignaturStatus,
      methode: input.methode,
      signatur_hash_sha256: signaturHash,
      signatur_daten: input.signatur_daten || null,
      signiert_am: zeitstempel,
      ip_adresse: input.ip_adresse || null,
      user_agent: input.user_agent || null,
      updated_at: zeitstempel,
    })
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .select()
    .single()
  if (error) throw new Error(`Signatur leisten: ${error.message}`)

  await protokolliereSignaturAudit(sb, orgId, {
    dokument_id: signatur.data.dokument_id,
    signatur_id: signaturId,
    aktion: 'signatur_geleistet',
    akteur_id: signatarId,
    details: { methode: input.methode, signatur_hash: signaturHash },
  })

  return data as Signatur
}

export async function lehneSignaturAb(
  sb: SupabaseClient,
  orgId: string,
  signaturId: string,
  signatarId: string,
  grund: string,
): Promise<Signatur> {
  if (!grund?.trim()) throw new Error('Ablehnungsgrund ist ein Pflichtfeld.')

  const { data: existing } = await sb
    .from('signaturen')
    .select('status')
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .single()
  if (!existing) throw new Error('Signatur nicht gefunden.')
  if (existing.status !== 'offen') {
    throw new Error(`Signatur kann nur im Status "offen" abgelehnt werden (aktuell: "${existing.status}").`)
  }

  const { data, error } = await sb
    .from('signaturen')
    .update({
      status: 'abgelehnt' as SignaturStatus,
      abgelehnt_am: new Date().toISOString(),
      ablehnung_grund: grund.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .eq('signatar_id', signatarId)
    .select()
    .single()
  if (error) throw new Error(`Signatur ablehnen: ${error.message}`)

  await protokolliereSignaturAudit(sb, orgId, {
    signatur_id: signaturId,
    aktion: 'signatur_abgelehnt',
    akteur_id: signatarId,
    details: { grund },
  })

  return data as Signatur
}

export async function verifiziereSignatur(
  sb: SupabaseClient,
  orgId: string,
  signaturId: string,
  adminUserId: string,
): Promise<{ gueltig: boolean; details: Record<string, unknown> }> {
  const { data: sig, error } = await sb
    .from('signaturen')
    .select('*, signatur_dokumente!inner(dokument_hash_sha256, dokument_inhalt_snapshot)')
    .eq('id', signaturId)
    .eq('organization_id', orgId)
    .single()

  if (error || !sig) throw new Error('Signatur nicht gefunden.')
  if (sig.status !== 'signiert') {
    return { gueltig: false, details: { grund: `Status ist "${sig.status}", nicht "signiert".` } }
  }

  const dok = sig.signatur_dokumente as unknown as { dokument_hash_sha256: string; dokument_inhalt_snapshot?: string } | null
  const erwarteterHash = berechneSignaturHash(
    dok?.dokument_hash_sha256 || '',
    sig.signatar_id,
    sig.signiert_am!,
  )

  const gueltig = sig.signatur_hash_sha256 === erwarteterHash

  const aktion: AuditAktionTyp = gueltig ? 'hash_verifiziert' : 'hash_ungueltig'
  await protokolliereSignaturAudit(sb, orgId, {
    dokument_id: sig.dokument_id,
    signatur_id: signaturId,
    aktion,
    akteur_id: adminUserId,
    details: { erwarteter_hash: erwarteterHash, vorhandener_hash: sig.signatur_hash_sha256 },
  })

  return {
    gueltig,
    details: {
      signatar: sig.signatar_name,
      signiert_am: sig.signiert_am,
      methode: sig.methode,
      hash_match: gueltig,
    },
  }
}

// ── Audit-Log ───────────────────────────────────────────────────

export async function protokolliereSignaturAudit(
  sb: SupabaseClient,
  orgId: string,
  eintrag: {
    dokument_id?: string
    signatur_id?: string
    aktion: AuditAktionTyp
    akteur_id: string
    akteur_name?: string
    details?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await sb
    .from('signatur_audit_log')
    .insert({
      organization_id: orgId,
      dokument_id: eintrag.dokument_id || null,
      signatur_id: eintrag.signatur_id || null,
      aktion: eintrag.aktion,
      akteur_id: eintrag.akteur_id,
      akteur_name: eintrag.akteur_name || null,
      details: eintrag.details || null,
    })
  if (error) throw new Error(`Signatur-Audit schreiben: ${error.message}`)
}

export async function listeSignaturAuditLog(
  sb: SupabaseClient,
  orgId: string,
  filter: SignaturAuditFilter = {},
): Promise<SignaturAuditLog[]> {
  let q = sb
    .from('signatur_audit_log')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })

  if (filter.dokument_id) q = q.eq('dokument_id', filter.dokument_id)
  if (filter.signatur_id) q = q.eq('signatur_id', filter.signatur_id)
  if (filter.aktion) q = q.eq('aktion', filter.aktion)
  if (filter.akteur_id) q = q.eq('akteur_id', filter.akteur_id)
  if (filter.limit) q = q.limit(filter.limit)
  if (filter.offset) q = q.range(filter.offset, filter.offset + (filter.limit || 50) - 1)

  const { data, error } = await q
  if (error) throw new Error(`Signatur-Audit laden: ${error.message}`)
  return (data ?? []) as SignaturAuditLog[]
}

// ── QES-Hook (externes Interface) ───────────────────────────────

export interface QesSignaturAnfrage {
  dokument_hash: string
  signatar_name: string
  signatar_email?: string
  callback_url: string
}

export interface QesSignaturAntwort {
  provider_signatur_id: string
  status: 'pending' | 'completed' | 'failed'
  signatur_hash?: string
  zeitstempel?: string
}

export async function sendeQesAnfrage(
  _hookConfig: { endpoint_url: string; api_key_ref: string },
  _anfrage: QesSignaturAnfrage,
): Promise<QesSignaturAntwort> {
  throw new Error(
    'QES ist als externe Integration vorbereitet. ' +
    'Implementieren Sie den Provider-spezifischen Adapter (z.B. sign-me, Swisscom AIS).',
  )
}
