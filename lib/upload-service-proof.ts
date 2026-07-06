import { createClient } from './supabase/client'

// ═══════════════════════════════════════════════════════════════
// uploadServiceProof — Upload für fotografierte Leistungsnachweise
// ═══════════════════════════════════════════════════════════════
// Variante von uploadDocument (lib/upload-document.ts) für den
// PRIVATEN Bucket `service-proofs` (Migration 20260706). Kein
// Doku-DB-Insert hier — der Aufrufer (OCR-Upload-Seite) erstellt
// den fachlichen ocr_results-Eintrag selbst über die API-Route.
// ═══════════════════════════════════════════════════════════════

export const MAX_PROOF_SIZE_MB = 15
const MAX_PROOF_SIZE_BYTES = MAX_PROOF_SIZE_MB * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 60_000

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']

export interface ProofUploadResult {
  ok: boolean
  path?: string
  url?: string
  errorMessage?: string
}

/**
 * Lädt ein Foto/PDF eines Leistungsnachweises in den privaten
 * `service-proofs`-Bucket und liefert Pfad + signierte URL zurück.
 *
 * @param file             Datei vom <input type="file" />
 * @param serviceRecordId  zugehöriger service_records.id (für Ordnerstruktur)
 */
export async function uploadServiceProof(
  file: File,
  serviceRecordId: string
): Promise<ProofUploadResult> {
  if (file.size > MAX_PROOF_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return { ok: false, errorMessage: `Datei zu groß (${mb} MB). Maximal ${MAX_PROOF_SIZE_MB} MB erlaubt.` }
  }

  const typeOk = ALLOWED_MIME_PREFIXES.some(prefix => file.type.startsWith(prefix))
  if (!typeOk) {
    return { ok: false, errorMessage: 'Nur Bilder (JPG, PNG, HEIC) und PDF-Dateien sind erlaubt.' }
  }

  const supabase = createClient()
  const filePath = `${serviceRecordId}/${Date.now()}-${sanitizeFileName(file.name)}`

  try {
    const uploadPromise = supabase.storage
      .from('service-proofs')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), UPLOAD_TIMEOUT_MS)
    )

    const result = await Promise.race([uploadPromise, timeoutPromise])
    const { error: uploadErr } = result as { error: unknown }

    if (uploadErr) {
      console.error('[uploadServiceProof] Storage error:', uploadErr)
      return { ok: false, errorMessage: 'Upload fehlgeschlagen. Bitte Internetverbindung prüfen und erneut versuchen.' }
    }
  } catch (err: any) {
    if (err?.message === 'TIMEOUT') {
      return { ok: false, errorMessage: 'Der Upload hat zu lange gedauert. Bitte kleineres Foto wählen oder WLAN nutzen.' }
    }
    console.error('[uploadServiceProof] Network exception:', err)
    return { ok: false, errorMessage: 'Netzwerkfehler. Bitte erneut versuchen.' }
  }

  // Privater Bucket → signierte URL (7 Tage), nicht getPublicUrl()
  const { data: signedData, error: signErr } = await supabase.storage
    .from('service-proofs')
    .createSignedUrl(filePath, 60 * 60 * 24 * 7)

  if (signErr || !signedData?.signedUrl) {
    console.error('[uploadServiceProof] Signed URL error:', signErr)
    return { ok: false, errorMessage: 'Datei hochgeladen, aber URL konnte nicht erstellt werden.' }
  }

  return { ok: true, path: filePath, url: signedData.signedUrl }
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100)
}
