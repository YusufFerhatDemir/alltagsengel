import { createHash } from 'node:crypto'
import type { KimAttachment, KimAttachmentMitUrl, KimClient } from './types'
import { writeKimAuditLog } from './audit-service'

export const KIM_ATTACHMENTS_BUCKET = 'kim-attachments'
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const ERLAUBTE_ANHANG_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'text/plain',
  'application/xml',
  'text/xml',
] as const

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 150) || 'anhang'
}

/**
 * Virus-Check-Platzhalter. KEINE echte Prüfung — es gibt in diesem
 * Projekt keine AV-Engine-Anbindung. Meldet ausdrücklich "ungeprüft"
 * statt fälschlich "sauber" vorzutäuschen, damit ein Aufrufer diese
 * Information nicht mit einem echten Scan verwechseln kann.
 */
export interface VirusScanResult {
  scanned: false
  reason: string
}

export function virusScanPlaceholder(): VirusScanResult {
  return { scanned: false, reason: 'Keine AV-Engine angebunden — Datei wurde NICHT auf Schadsoftware geprüft.' }
}

export interface UploadKimAttachmentParams {
  organizationId: string
  messageId: string
  actorId?: string | null
  datei: { name: string; type: string; arrayBuffer: ArrayBuffer }
}

export async function uploadKimAttachment(admin: KimClient, params: UploadKimAttachmentParams): Promise<KimAttachment> {
  const mime = params.datei.type
  if (!ERLAUBTE_ANHANG_MIME_TYPES.includes(mime as (typeof ERLAUBTE_ANHANG_MIME_TYPES)[number])) {
    throw new Error(`Dateityp "${mime || 'unbekannt'}" nicht erlaubt. Erlaubt: PDF, JPEG, PNG, TIFF, TXT, XML.`)
  }
  if (params.datei.arrayBuffer.byteLength === 0) throw new Error('Die Datei ist leer.')
  if (params.datei.arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error('Anhang ist größer als 25 MB.')
  }

  const checksum = createHash('sha256').update(Buffer.from(params.datei.arrayBuffer)).digest('hex')
  const storagePath = `${params.organizationId}/${params.messageId}/${Date.now()}-${sanitizeFileName(params.datei.name)}`

  const { error: uploadErr } = await admin.storage
    .from(KIM_ATTACHMENTS_BUCKET)
    .upload(storagePath, params.datei.arrayBuffer, { contentType: mime, cacheControl: '3600', upsert: false })
  if (uploadErr) throw new Error(`Anhang-Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data, error } = await admin
    .from('kim_attachments')
    .insert({
      message_id: params.messageId,
      organization_id: params.organizationId,
      filename: params.datei.name,
      mime_type: mime,
      size_bytes: params.datei.arrayBuffer.byteLength,
      storage_path: storagePath,
      checksum_sha256: checksum,
    })
    .select('*')
    .single()

  if (error || !data) {
    await admin.storage.from(KIM_ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => undefined)
    throw new Error(`Anhang-Metadaten konnten nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)
  }

  await writeKimAuditLog(admin, {
    organizationId: params.organizationId,
    aktion: 'anhang_hochgeladen',
    messageId: params.messageId,
    actorId: params.actorId ?? null,
    details: { filename: params.datei.name, size_bytes: params.datei.arrayBuffer.byteLength, ...virusScanPlaceholder() },
  })

  return data as KimAttachment
}

export async function listKimAttachments(
  admin: KimClient,
  messageId: string,
  organizationId: string,
  signedUrlExpiresIn = 300
): Promise<KimAttachmentMitUrl[]> {
  const { data, error } = await admin
    .from('kim_attachments')
    .select('*')
    .eq('message_id', messageId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Anhänge konnten nicht geladen werden: ${error.message}`)

  const anhaenge = (data ?? []) as KimAttachment[]
  return Promise.all(anhaenge.map(async anhang => {
    const { data: signed, error: signErr } = await admin.storage
      .from(KIM_ATTACHMENTS_BUCKET)
      .createSignedUrl(anhang.storage_path, signedUrlExpiresIn)
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Signierte URL für ${anhang.filename} konnte nicht erstellt werden: ${signErr?.message ?? 'unbekannt'}`)
    }
    return { ...anhang, signed_url: signed.signedUrl }
  }))
}

/** Lädt die Rohdaten eines Anhangs — für den Versand über einen Provider. */
export async function downloadKimAttachmentBytes(admin: KimClient, attachment: KimAttachment): Promise<ArrayBuffer> {
  const { data, error } = await admin.storage.from(KIM_ATTACHMENTS_BUCKET).download(attachment.storage_path)
  if (error || !data) throw new Error(`Anhang konnte nicht geladen werden: ${error?.message ?? 'unbekannt'}`)
  return data.arrayBuffer()
}
