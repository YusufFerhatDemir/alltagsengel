import { createHash } from 'node:crypto'
import type { KimAttachment, KimAttachmentMitUrl, KimClient } from './types'
import { writeKimAuditLog } from './audit-service'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { sanitizeStorageName } from '@/lib/file-upload-validation'

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

// sanitizeFileName entfernt — zentralisiert in lib/file-upload-validation.ts (sanitizeStorageName)

/**
 * Kennbytes der zulaessigen Binaerformate.
 *
 * Warum das noetig ist: der MIME-Typ wird NICHT ermittelt, sondern
 * behauptet — beim Upload aus dem Formular vom Browser (`File.type`), beim
 * Empfang aus dem KIM-Postfach vom absendenden System. Die Allowlist allein
 * prueft also nur, was jemand ueber die Datei sagt, nicht was drinsteht.
 * Eine HTML-Datei mit `application/pdf` im Umschlag landete so im Bucket und
 * wurde spaeter ueber eine signierte URL ausgeliefert.
 *
 * Textformate (txt/xml) haben keine verlaessliche Signatur und werden
 * bewusst nicht geprueft — dort traegt der Content-Type der Auslieferung.
 */
const KENNBYTES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],                       // %PDF
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/tiff': [[0x49, 0x49, 0x2a, 0x00], [0x4d, 0x4d, 0x00, 0x2a]],  // LE / BE
}

/** true, wenn der Inhalt zum behaupteten Typ passt (oder der Typ signaturlos ist). */
export function inhaltPasstZuTyp(mime: string, daten: ArrayBuffer): boolean {
  const muster = KENNBYTES[mime]
  if (!muster) return true
  const kopf = new Uint8Array(daten.slice(0, 16))
  return muster.some(m => m.every((b, i) => kopf[i] === b))
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

/**
 * Prueft den Anhang, bevor irgendetwas geschrieben wird. Als eigene Funktion
 * exportiert, damit der Empfangsweg (inbox-service) einen unzulaessigen
 * Anhang VERWERFEN kann, ohne den Import der uebrigen Nachrichten
 * abzubrechen — ein einzelner kaputter Anhang eines fremden Absenders legte
 * sonst das ganze Postfach lahm, bei jedem Abruf erneut.
 */
export function pruefeKimAnhang(datei: { name: string; type: string; arrayBuffer: ArrayBuffer }): void {
  const mime = datei.type
  if (!ERLAUBTE_ANHANG_MIME_TYPES.includes(mime as (typeof ERLAUBTE_ANHANG_MIME_TYPES)[number])) {
    throw new UserFacingError(`Dateityp "${mime || 'unbekannt'}" nicht erlaubt. Erlaubt: PDF, JPEG, PNG, TIFF, TXT, XML.`, 400)
  }
  if (datei.arrayBuffer.byteLength === 0) throw new UserFacingError('Die Datei ist leer.', 400)
  if (datei.arrayBuffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new UserFacingError('Anhang ist größer als 25 MB.', 400)
  }
  if (!inhaltPasstZuTyp(mime, datei.arrayBuffer)) {
    throw new UserFacingError(`Der Inhalt der Datei passt nicht zum angegebenen Typ "${mime}".`, 400)
  }
}

export async function uploadKimAttachment(admin: KimClient, params: UploadKimAttachmentParams): Promise<KimAttachment> {
  const mime = params.datei.type
  pruefeKimAnhang(params.datei)

  // Belt-and-braces: `admin` ist der service_role-Client und umgeht RLS.
  // Ohne diese Pruefung haengt ein Anhang an einer Nachricht, die einem
  // anderen Mandanten gehoert — und geht mit ihr hinaus.
  const { data: nachricht } = await admin
    .from('kim_messages')
    .select('id')
    .eq('id', params.messageId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (!nachricht) {
    throw new UserFacingError('KIM-Nachricht nicht gefunden oder gehört zu einer anderen Organisation.', 404)
  }

  const checksum = createHash('sha256').update(Buffer.from(params.datei.arrayBuffer)).digest('hex')
  const storagePath = `${params.organizationId}/${params.messageId}/${Date.now()}-${sanitizeStorageName(params.datei.name, { maxLen: 150, fallback: 'anhang' })}`

  const { error: uploadErr } = await admin.storage
    .from(KIM_ATTACHMENTS_BUCKET)
    .upload(storagePath, params.datei.arrayBuffer, { contentType: mime, cacheControl: '3600', upsert: false })
  if (uploadErr) throw new Error(`kim-attachments upload fehlgeschlagen: ${uploadErr.message}`)

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
    throw new Error(`kim_attachments insert fehlgeschlagen: ${error?.message ?? 'unbekannt'}`)
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
  if (error) throw new Error(`kim_attachments select fehlgeschlagen: ${error.message}`)

  const anhaenge = (data ?? []) as KimAttachment[]
  return Promise.all(anhaenge.map(async anhang => {
    const { data: signed } = await admin.storage
      .from(KIM_ATTACHMENTS_BUCKET)
      .createSignedUrl(anhang.storage_path, signedUrlExpiresIn)
    // Ein Anhang ohne signierte URL wird mit signed_url: null gemeldet,
    // statt die ganze Liste zu reissen: sonst macht eine einzige fehlende
    // Datei im Bucket alle uebrigen Anhaenge der Nachricht unerreichbar.
    return { ...anhang, signed_url: signed?.signedUrl ?? null }
  }))
}

/** Lädt die Rohdaten eines Anhangs — für den Versand über einen Provider. */
export async function downloadKimAttachmentBytes(admin: KimClient, attachment: KimAttachment): Promise<ArrayBuffer> {
  const { data, error } = await admin.storage.from(KIM_ATTACHMENTS_BUCKET).download(attachment.storage_path)
  if (error || !data) throw new Error(`kim-attachments download fehlgeschlagen: ${error?.message ?? 'unbekannt'}`)
  return data.arrayBuffer()
}
