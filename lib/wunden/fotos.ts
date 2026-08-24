// ═══════════════════════════════════════════════════════════════
// Fotodokumentation — wound_photos + privater Bucket wound-photos
// Upload/Download ausschließlich serverseitig (service_role) mit
// kurzlebigen Signed URLs — analog lib/akten/dokumente.ts.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { WoundPhoto, WoundPhotoMitUrl } from './types'
import { sanitizeStorageName } from '@/lib/file-upload-validation'

export const WOUND_PHOTOS_BUCKET = 'wound-photos'
export const MAX_FOTO_BYTES = 10 * 1024 * 1024
export const ERLAUBTE_FOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const

// sanitizeFileName entfernt — zentralisiert in lib/file-upload-validation.ts (sanitizeStorageName)

export interface UploadWoundPhotoParams {
  organizationId: string
  woundId: string
  assessmentId?: string | null
  aufgenommenVon: string
  aufgenommenAm?: string | null
  bemerkung?: string | null
  datei: { name: string; type: string; arrayBuffer: ArrayBuffer }
}

export async function uploadWoundPhoto(admin: SupabaseClient, params: UploadWoundPhotoParams): Promise<WoundPhoto> {
  const mime = params.datei.type
  if (!ERLAUBTE_FOTO_MIME_TYPES.includes(mime as (typeof ERLAUBTE_FOTO_MIME_TYPES)[number])) {
    throw new Error(`Dateityp "${mime || 'unbekannt'}" nicht erlaubt. Erlaubt: JPEG, PNG, WebP, HEIC.`)
  }
  if (params.datei.arrayBuffer.byteLength === 0) throw new Error('Die Datei ist leer.')
  if (params.datei.arrayBuffer.byteLength > MAX_FOTO_BYTES) {
    throw new Error('Foto ist größer als 10 MB.')
  }

  const dateipfad = `${params.organizationId}/${params.woundId}/${Date.now()}-${sanitizeStorageName(params.datei.name, { maxLen: 120, fallback: 'foto' })}`

  const { error: uploadErr } = await admin.storage
    .from(WOUND_PHOTOS_BUCKET)
    .upload(dateipfad, params.datei.arrayBuffer, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    })
  if (uploadErr) throw new Error(`Foto-Upload fehlgeschlagen: ${uploadErr.message}`)

  const { data, error } = await admin
    .from('wound_photos')
    .insert({
      organization_id: params.organizationId,
      wound_id: params.woundId,
      assessment_id: params.assessmentId ?? null,
      bucket: WOUND_PHOTOS_BUCKET,
      dateipfad,
      dateiname: params.datei.name,
      mime_type: mime,
      dateigroesse_bytes: params.datei.arrayBuffer.byteLength,
      aufgenommen_am: params.aufgenommenAm ?? new Date().toISOString(),
      aufgenommen_von: params.aufgenommenVon,
      bemerkung: params.bemerkung ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    // Metadaten-Insert fehlgeschlagen: hochgeladene Datei nicht verwaisen lassen.
    await admin.storage.from(WOUND_PHOTOS_BUCKET).remove([dateipfad]).catch(() => undefined)
    throw new Error(`Foto-Metadaten konnten nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as WoundPhoto
}

export async function listWoundPhotos(
  admin: SupabaseClient,
  woundId: string,
  organizationId: string,
  signedUrlExpiresIn = 300
): Promise<WoundPhotoMitUrl[]> {
  const { data, error } = await admin
    .from('wound_photos')
    .select('*')
    .eq('wound_id', woundId)
    .eq('organization_id', organizationId)
    .order('aufgenommen_am', { ascending: false })
  if (error) throw new Error(`Fotos konnten nicht geladen werden: ${error.message}`)

  const fotos = (data ?? []) as WoundPhoto[]
  return Promise.all(fotos.map(async foto => {
    const { data: signed, error: signErr } = await admin.storage
      .from(foto.bucket)
      .createSignedUrl(foto.dateipfad, signedUrlExpiresIn)
    if (signErr || !signed?.signedUrl) {
      throw new Error(`Signierte URL für ${foto.dateiname} konnte nicht erstellt werden: ${signErr?.message ?? 'unbekannt'}`)
    }
    return { ...foto, signed_url: signed.signedUrl }
  }))
}
