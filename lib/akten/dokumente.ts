import { UserFacingError } from '@/lib/api/user-facing-error'
import { sanitizeStorageName } from '@/lib/file-upload-validation'
// ═══════════════════════════════════════════════════════════════
// Zentrales Dokumentenmanagement — akten_dokumente
// CRUD, Upload (Storage + SHA-256), Versionierung, Sperre, Archivierung
// ═══════════════════════════════════════════════════════════════
// Konvention (wie lib/billing/core/*): Supabase-Client wird injiziert,
// niemals global importiert. Für alles, was Storage anfasst, muss der
// Admin/Service-Role-Client übergeben werden — die Buckets `vertraege`,
// `kunden-dokumente`, `mitarbeiter-dokumente` haben keine Client-seitigen
// Storage-RLS-Policies (siehe Migration), Zugriff läuft ausschließlich
// über API-Routen mit createAdminClient().

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAktenZugriff } from './zugriff-log'
import {
  bucketForZuordnung,
  DOKUMENT_KATEGORIEN, DOKUMENT_SICHTBARKEIT_WERTE, DOKUMENT_STATUS_WERTE, DOKUMENT_TYPEN,
  type AktenDokument, type DokumentKategorie, type DokumentSichtbarkeit, type DokumentStatus, type DokumentTyp,
} from './types'

/** Weist einen unbekannten String-Wert zurueck, bevor er den DB-CHECK-Constraint erreicht. */
function assertDokumentEnum<T extends string>(werte: readonly T[], wert: T, feld: string): void {
  if (!werte.includes(wert)) {
    throw new UserFacingError(`Ungültiger Wert für ${feld}: "${wert}". Erlaubt: ${werte.join(', ')}.`)
  }
}

// ---------------------------------------------------------------------------
// SHA-256
// ---------------------------------------------------------------------------

/** Berechnet den SHA-256-Hash einer Datei (Browser + Node/Edge). */
export async function computeSha256Hex(data: ArrayBuffer): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  const { createHash } = await import('crypto')
  return createHash('sha256').update(Buffer.from(data)).digest('hex')
}

// sanitizeFileName entfernt — zentralisiert in lib/file-upload-validation.ts (sanitizeStorageName)

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadDateiInput {
  name: string
  type: string
  arrayBuffer: ArrayBuffer
}

export interface UploadDateiResult {
  bucket: string
  dateipfad: string
  dateiname: string
  dateigroesseBytes: number
  mimeType: string
  sha256Hash: string
}

/** Lädt eine Datei in den passenden privaten Bucket hoch. Muss mit Admin/Service-Role-Client aufgerufen werden. */
export async function uploadDokumentDatei(
  admin: SupabaseClient,
  params: {
    organizationId: string
    clientId?: string | null
    caregiverId?: string | null
    datei: UploadDateiInput
  }
): Promise<UploadDateiResult> {
  const bucket = bucketForZuordnung(params.clientId ?? null, params.caregiverId ?? null)
  const scope = params.clientId ?? params.caregiverId ?? 'org'
  const sha256Hash = await computeSha256Hex(params.datei.arrayBuffer)
  const dateiname = params.datei.name
  const dateipfad = `${params.organizationId}/${scope}/${Date.now()}-${sanitizeStorageName(dateiname, { maxLen: 100 })}`

  const { error: uploadErr } = await admin.storage
    .from(bucket)
    .upload(dateipfad, params.datei.arrayBuffer, {
      contentType: params.datei.type || 'application/octet-stream',
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadErr) throw new Error(`Upload fehlgeschlagen: ${uploadErr.message}`)

  return {
    bucket,
    dateipfad,
    dateiname,
    dateigroesseBytes: params.datei.arrayBuffer.byteLength,
    mimeType: params.datei.type || 'application/octet-stream',
    sha256Hash,
  }
}

/** Erzeugt eine kurzlebige signierte Download-URL für ein bereits hochgeladenes Dokument. */
export async function getSignedDokumentUrl(
  admin: SupabaseClient,
  bucket: string,
  dateipfad: string,
  expiresInSeconds = 300
): Promise<string> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(dateipfad, expiresInSeconds)
  if (error || !data?.signedUrl) throw new Error(`Signierte URL konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreateDokumentParams {
  organizationId: string
  clientId?: string | null
  caregiverId?: string | null
  titel: string
  dokumentTyp: DokumentTyp
  kategorie?: DokumentKategorie
  datei: UploadDateiResult
  dokumentDatum?: string | null
  gueltigVon?: string | null
  gueltigBis?: string | null
  ablaufdatum?: string | null
  sichtbarkeit?: DokumentSichtbarkeit
  tags?: string[]
  interneBemerkung?: string | null
  erstelltVon: string
  actorRole?: string
}

export async function createDokument(supabase: SupabaseClient, params: CreateDokumentParams): Promise<AktenDokument> {
  if (params.clientId && params.caregiverId) {
    throw new UserFacingError('Ein Dokument kann nicht gleichzeitig Kunde und Mitarbeiter zugeordnet sein.')
  }
  assertDokumentEnum(DOKUMENT_TYPEN, params.dokumentTyp, 'dokumentTyp')
  if (params.kategorie !== undefined) assertDokumentEnum(DOKUMENT_KATEGORIEN, params.kategorie, 'kategorie')
  if (params.sichtbarkeit !== undefined) assertDokumentEnum(DOKUMENT_SICHTBARKEIT_WERTE, params.sichtbarkeit, 'sichtbarkeit')

  const { data, error } = await supabase
    .from('akten_dokumente')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId ?? null,
      caregiver_id: params.caregiverId ?? null,
      titel: params.titel,
      dokument_typ: params.dokumentTyp,
      kategorie: params.kategorie ?? 'allgemein',
      dateiname: params.datei.dateiname,
      dateipfad: params.datei.dateipfad,
      dateigroesse_bytes: params.datei.dateigroesseBytes,
      mime_type: params.datei.mimeType,
      sha256_hash: params.datei.sha256Hash,
      dokument_datum: params.dokumentDatum ?? null,
      gueltig_von: params.gueltigVon ?? null,
      gueltig_bis: params.gueltigBis ?? null,
      ablaufdatum: params.ablaufdatum ?? null,
      sichtbarkeit: params.sichtbarkeit ?? 'intern',
      tags: params.tags ?? [],
      interne_bemerkung: params.interneBemerkung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`Dokument konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId: params.organizationId,
    entitaetTyp: 'dokument',
    entitaetId: data.id,
    aktion: 'hochgeladen',
    benutzerId: params.erstelltVon,
    benutzerRolle: params.actorRole,
    dokumentId: data.id,
    details: { titel: params.titel, dokument_typ: params.dokumentTyp },
  })

  return data as AktenDokument
}

export interface ListDokumenteFilter {
  organizationId: string
  clientId?: string
  caregiverId?: string
  dokumentTyp?: DokumentTyp
  kategorie?: DokumentKategorie
  status?: DokumentStatus
  sichtbarkeit?: DokumentSichtbarkeit
  tag?: string
  suche?: string
  ablaufBis?: string
  limit?: number
  offset?: number
}

/**
 * Verpackt einen Suchbegriff als PostgREST-Wert fuer eine `or()`-Gruppe.
 *
 * `or()` bekommt eine ZEICHENKETTE, die PostgREST selbst zerlegt: Komma
 * trennt die Bedingungen, Punkt trennt Spalte/Operator/Wert, Klammern
 * gruppieren. Ein ungeschuetzt eingesetzter Suchbegriff aus der URL
 * (?suche=…) konnte damit weitere ODER-Bedingungen in die Abfrage
 * schreiben. Der Mandantenzaun steht als eigenes eq() daneben und wurde
 * dadurch nicht durchbrochen — die Trefferliste liess sich aber ueber
 * den vorgesehenen Titel-/Dateinamen-Vergleich hinaus aufziehen.
 *
 * Anfuehrungszeichen um den Wert nehmen den Sonderzeichen ihre Bedeutung;
 * Backslash und Anfuehrungszeichen im Begriff selbst werden maskiert.
 */
// Die Maskierregel liegt jetzt in lib/supabase/postgrest-filter.ts, damit
// sie nicht nur der Aktensuche zur Verfuegung steht (Befund Track 7: das
// KIM-Adressbuch hatte sie nicht). Der hiesige Name bleibt als Re-Export
// bestehen — die Aufrufer in diesem Modul und in lib/akten/suche.ts
// muessen dafuer nicht angefasst werden.
export { postgrestSuchwert as postgrestWert }
import { postgrestSuchwert } from '@/lib/supabase/postgrest-filter'

export async function listDokumente(supabase: SupabaseClient, filter: ListDokumenteFilter): Promise<AktenDokument[]> {
  let query = supabase
    .from('akten_dokumente')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.dokumentTyp) query = query.eq('dokument_typ', filter.dokumentTyp)
  if (filter.kategorie) query = query.eq('kategorie', filter.kategorie)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.sichtbarkeit) query = query.eq('sichtbarkeit', filter.sichtbarkeit)
  if (filter.tag) query = query.contains('tags', [filter.tag])
  if (filter.ablaufBis) query = query.lte('ablaufdatum', filter.ablaufBis)
  if (filter.suche) {
    const s = postgrestSuchwert(filter.suche)
    query = query.or(`titel.ilike.${s},dateiname.ilike.${s}`)
  }
  if (filter.limit) query = query.range(filter.offset ?? 0, (filter.offset ?? 0) + filter.limit - 1)

  const { data, error } = await query
  if (error) throw new Error(`Dokumente konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as AktenDokument[]
}

export async function getDokument(supabase: SupabaseClient, id: string, organizationId: string): Promise<AktenDokument | null> {
  const { data, error } = await supabase
    .from('akten_dokumente')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(`Dokument konnte nicht geladen werden: ${error.message}`)
  return data as AktenDokument | null
}

export interface UpdateDokumentParams {
  titel?: string
  kategorie?: DokumentKategorie
  gueltigVon?: string | null
  gueltigBis?: string | null
  ablaufdatum?: string | null
  status?: DokumentStatus
  sichtbarkeit?: DokumentSichtbarkeit
  tags?: string[]
  interneBemerkung?: string | null
}

export async function updateDokument(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateDokumentParams,
  actorId: string,
  actorRole?: string
): Promise<AktenDokument> {
  const existing = await getDokument(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Dokument nicht gefunden.')
  if (existing.gesperrt) throw new UserFacingError('Gesperrtes Dokument kann nicht bearbeitet werden. Erst entsperren.')

  if (patch.kategorie !== undefined) assertDokumentEnum(DOKUMENT_KATEGORIEN, patch.kategorie, 'kategorie')
  if (patch.status !== undefined) assertDokumentEnum(DOKUMENT_STATUS_WERTE, patch.status, 'status')
  if (patch.sichtbarkeit !== undefined) assertDokumentEnum(DOKUMENT_SICHTBARKEIT_WERTE, patch.sichtbarkeit, 'sichtbarkeit')

  const update: Record<string, unknown> = {}
  if (patch.titel !== undefined) update.titel = patch.titel
  if (patch.kategorie !== undefined) update.kategorie = patch.kategorie
  if (patch.gueltigVon !== undefined) update.gueltig_von = patch.gueltigVon
  if (patch.gueltigBis !== undefined) update.gueltig_bis = patch.gueltigBis
  if (patch.ablaufdatum !== undefined) update.ablaufdatum = patch.ablaufdatum
  if (patch.status !== undefined) update.status = patch.status
  if (patch.sichtbarkeit !== undefined) update.sichtbarkeit = patch.sichtbarkeit
  if (patch.tags !== undefined) update.tags = patch.tags
  if (patch.interneBemerkung !== undefined) update.interne_bemerkung = patch.interneBemerkung

  const { data, error } = await supabase
    .from('akten_dokumente')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Dokument konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  const aktion = patch.status === 'archiviert' ? 'archiviert' : 'bearbeitet'
  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'dokument', entitaetId: id, aktion,
    benutzerId: actorId, benutzerRolle: actorRole, dokumentId: id, details: patch as Record<string, unknown>,
  })

  return data as AktenDokument
}

export async function softDeleteDokument(supabase: SupabaseClient, id: string, organizationId: string, actorId: string, actorRole?: string): Promise<void> {
  const existing = await getDokument(supabase, id, organizationId)
  if (!existing) throw new UserFacingError('Dokument nicht gefunden.')
  if (existing.gesperrt) throw new UserFacingError('Gesperrtes Dokument kann nicht gelöscht werden. Erst entsperren.')

  const { error } = await supabase
    .from('akten_dokumente')
    .update({ deleted_at: new Date().toISOString(), deleted_by: actorId })
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Dokument konnte nicht gelöscht werden: ${error.message}`)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'dokument', entitaetId: id, aktion: 'geloescht',
    benutzerId: actorId, benutzerRolle: actorRole, dokumentId: id,
  })
}

// ---------------------------------------------------------------------------
// Sperre
// ---------------------------------------------------------------------------

export async function lockDokument(supabase: SupabaseClient, id: string, organizationId: string, grund: string, actorId: string, actorRole?: string): Promise<AktenDokument> {
  const { data, error } = await supabase
    .from('akten_dokumente')
    .update({ gesperrt: true, gesperrt_grund: grund, gesperrt_am: new Date().toISOString(), gesperrt_von: actorId })
    .eq('id', id)
    .eq('organization_id', organizationId)
    // Ein geloeschtes Dokument ist kein Dokument mehr. Ohne diesen Filter
    // liess es sich sperren und entsperren — als einzige der Operationen
    // hier, weil Sperre/Entsperre nicht ueber getDokument() laufen.
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Dokument konnte nicht gesperrt werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'dokument', entitaetId: id, aktion: 'gesperrt',
    benutzerId: actorId, benutzerRolle: actorRole, dokumentId: id, details: { grund },
  })
  return data as AktenDokument
}

export async function unlockDokument(supabase: SupabaseClient, id: string, organizationId: string, actorId: string, actorRole?: string): Promise<AktenDokument> {
  const { data, error } = await supabase
    .from('akten_dokumente')
    .update({ gesperrt: false, gesperrt_grund: null, gesperrt_am: null, gesperrt_von: null })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Dokument konnte nicht entsperrt werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId, entitaetTyp: 'dokument', entitaetId: id, aktion: 'entsperrt',
    benutzerId: actorId, benutzerRolle: actorRole, dokumentId: id,
  })
  return data as AktenDokument
}

// ---------------------------------------------------------------------------
// Versionierung
// ---------------------------------------------------------------------------

export async function addDokumentVersion(
  supabase: SupabaseClient,
  params: {
    dokumentId: string
    organizationId: string
    datei: UploadDateiResult
    aenderungsgrund?: string
    actorId: string
    actorRole?: string
  }
): Promise<AktenDokument> {
  const existing = await getDokument(supabase, params.dokumentId, params.organizationId)
  if (!existing) throw new UserFacingError('Dokument nicht gefunden.')
  if (existing.gesperrt) throw new UserFacingError('Gesperrtes Dokument kann nicht versioniert werden. Erst entsperren.')

  const neueVersion = existing.aktuelle_version + 1

  const { error: versionErr } = await supabase.from('akten_dokument_versionen').insert({
    organization_id: params.organizationId,
    dokument_id: params.dokumentId,
    version: neueVersion,
    dateiname: params.datei.dateiname,
    dateipfad: params.datei.dateipfad,
    dateigroesse_bytes: params.datei.dateigroesseBytes,
    mime_type: params.datei.mimeType,
    sha256_hash: params.datei.sha256Hash,
    aenderungsgrund: params.aenderungsgrund ?? null,
    erstellt_von: params.actorId,
  })
  if (versionErr) throw new Error(`Version konnte nicht gespeichert werden: ${versionErr.message}`)

  const { data, error } = await supabase
    .from('akten_dokumente')
    .update({
      dateiname: params.datei.dateiname,
      dateipfad: params.datei.dateipfad,
      dateigroesse_bytes: params.datei.dateigroesseBytes,
      mime_type: params.datei.mimeType,
      sha256_hash: params.datei.sha256Hash,
      aktuelle_version: neueVersion,
    })
    .eq('id', params.dokumentId)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Dokument konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logAktenZugriff(supabase, {
    organizationId: params.organizationId, entitaetTyp: 'dokument', entitaetId: params.dokumentId,
    aktion: 'version_erstellt', benutzerId: params.actorId, benutzerRolle: params.actorRole,
    dokumentId: params.dokumentId, details: { version: neueVersion, aenderungsgrund: params.aenderungsgrund },
  })

  return data as AktenDokument
}

export async function listDokumentVersionen(supabase: SupabaseClient, dokumentId: string, organizationId: string) {
  const { data, error } = await supabase
    .from('akten_dokument_versionen')
    .select('*')
    .eq('dokument_id', dokumentId)
    .eq('organization_id', organizationId)
    .order('version', { ascending: false })
  if (error) throw new Error(`Versionen konnten nicht geladen werden: ${error.message}`)
  return data ?? []
}
