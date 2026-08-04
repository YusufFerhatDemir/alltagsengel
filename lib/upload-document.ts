import { createClient } from './supabase/client'

// ═══════════════════════════════════════════════════════════════
// uploadDocument — Robuster Datei-Upload mit Timeout + Validierung
// ═══════════════════════════════════════════════════════════════
//
// WARUM existiert das?
//
// Vorher gab es in app/kunde/dokumente und app/engel/dokumente einen
// sporadischen Hang-Bug: "Wird hochgeladen..." blieb ewig stehen.
//
// Ursachen:
//   1. Kein try/catch → Network-Exception → setUploading(false) nie
//      erreicht → Button ewig im Loading-State.
//   2. Kein Timeout → Storage-Hänger = Endlos-Warten (besonders bei
//      schwachem Mobilfunk / Senioren mit langsamen Geräten).
//   3. Keine Dateigrößen-Prüfung → Senior wählt 30 MB HEIC-Foto aus,
//      keine Rückmeldung warum es ewig dauert.
//   4. Fehler nicht sichtbar → nur console.error, User weiß nichts.
//   5. Sensible Dokumente (Personalausweis!) dürfen NIEMALS über eine
//      öffentliche URL erreichbar sein (DSGVO). Der `documents`-Bucket ist
//      privat; Zugriff ausschließlich über signierte, ablaufende URLs
//      (createSignedUrl, analog `service-proofs`) — nie getPublicUrl().
//
// ═══════════════════════════════════════════════════════════════

export const MAX_FILE_SIZE_MB = 15
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 60_000 // 60 Sekunden
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 Tage (analog service-proofs)

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']

export interface UploadResult {
  ok: boolean
  url?: string
  /** Storage-Pfad im privaten Bucket — für spätere On-Demand-Signierung. */
  path?: string
  errorMessage?: string
  errorCode?:
    | 'no_user'
    | 'file_too_large'
    | 'invalid_type'
    | 'storage_error'
    | 'timeout'
    | 'db_error'
    | 'network'
}

/**
 * Prüft, ob die `documents`-Tabelle in der DB existiert.
 * Cacht das Ergebnis für die Session.
 */
let _documentsTableExists: boolean | null = null
export async function checkDocumentsTableExists(): Promise<boolean> {
  if (_documentsTableExists !== null) return _documentsTableExists
  const supabase = createClient()
  const { error } = await supabase.from('documents').select('id').limit(0)
  // Supabase gibt 42P01 (relation does not exist) zurück wenn Tabelle fehlt
  _documentsTableExists = !error || !error.message?.includes('does not exist')
  return _documentsTableExists
}

/**
 * Lädt eine Datei in den `documents`-Bucket und erstellt einen DB-Eintrag.
 *
 * @param file        Datei-Objekt vom <input type="file" />
 * @param userId      Auth-UserID (vorher via requireUser() bestätigt)
 * @param docType     z.B. "ausweis", "versicherung", "fuehrungszeugnis"
 * @returns           UploadResult mit ok/url/errorMessage
 *
 * HINWEIS: Die `documents`-Tabelle existiert derzeit nicht in der Produktions-DB.
 * Die Funktion prüft dies vorab und gibt einen beschreibenden Fehler zurück.
 * Sobald die Tabelle per Migration angelegt wird, funktioniert der Upload automatisch.
 */
export async function uploadDocument(
  file: File,
  userId: string,
  docType: string
): Promise<UploadResult> {
  // ═══ 0. Feature-Guard: Tabelle muss existieren ═══
  const tableExists = await checkDocumentsTableExists()
  if (!tableExists) {
    return {
      ok: false,
      errorCode: 'db_error',
      errorMessage:
        'Die Dokumenten-Verwaltung ist derzeit nicht verfügbar. Bitte kontaktieren Sie den Support.',
    }
  }
  // ═══ 1. Validierung: Dateigröße ═══
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return {
      ok: false,
      errorCode: 'file_too_large',
      errorMessage: `Datei zu groß (${mb} MB). Maximal ${MAX_FILE_SIZE_MB} MB erlaubt. Bitte komprimiere das Foto.`,
    }
  }

  // ═══ 2. Validierung: Dateityp ═══
  const typeOk = ALLOWED_MIME_PREFIXES.some(prefix => file.type.startsWith(prefix))
  if (!typeOk) {
    return {
      ok: false,
      errorCode: 'invalid_type',
      errorMessage: 'Nur Bilder (JPG, PNG, HEIC) und PDF-Dateien sind erlaubt.',
    }
  }

  const supabase = createClient()

  // ═══ 3. Upload mit Timeout-Race ═══
  const filePath = `${userId}/${Date.now()}-${sanitizeFileName(file.name)}`

  try {
    const uploadPromise = supabase.storage
      .from('documents')
      .upload(filePath, file, { cacheControl: '3600', upsert: false })

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('TIMEOUT')),
        UPLOAD_TIMEOUT_MS
      )
    )

    const result = await Promise.race([uploadPromise, timeoutPromise])
    const { error: uploadErr } = result as { error: unknown }

    if (uploadErr) {
      console.error('[uploadDocument] Storage error:', uploadErr)
      return {
        ok: false,
        errorCode: 'storage_error',
        errorMessage:
          'Upload fehlgeschlagen. Bitte prüfe deine Internetverbindung und versuche es erneut.',
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'TIMEOUT') {
      return {
        ok: false,
        errorCode: 'timeout',
        errorMessage:
          'Der Upload hat zu lange gedauert. Bitte wechsle zu WLAN oder wähle ein kleineres Foto.',
      }
    }
    console.error('[uploadDocument] Network exception:', err)
    return {
      ok: false,
      errorCode: 'network',
      errorMessage:
        'Netzwerkfehler. Bitte prüfe deine Internetverbindung und versuche es erneut.',
    }
  }

  // ═══ 4. Signierte URL (7 Tage) statt öffentlicher URL ═══
  // SICHERHEIT/DSGVO: `documents` enthält hochsensible Nachweise
  // (Personalausweis, Führungszeugnis, Versicherung). Der Bucket ist privat;
  // Zugriff ausschließlich über signierte, ablaufende URLs — niemals
  // getPublicUrl(). Gespeichert wird zusätzlich der Pfad, damit die URL bei
  // Ablauf serverseitig neu signiert werden kann (getSignedDocumentUrl).
  const { data: signedData, error: signErr } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS)

  if (signErr || !signedData?.signedUrl) {
    console.error('[uploadDocument] Signed URL error:', signErr)
    try {
      await supabase.storage.from('documents').remove([filePath])
    } catch {
      // Rollback-Fehler ignorieren, Haupt-Fehler ist wichtiger
    }
    return {
      ok: false,
      errorCode: 'storage_error',
      errorMessage:
        'Datei hochgeladen, aber der Zugriffslink konnte nicht erstellt werden. Bitte erneut versuchen.',
    }
  }

  // ═══ 5. DB-Eintrag — mit Rollback falls Insert scheitert ═══
  const { error: insertErr } = await supabase.from('documents').insert({
    user_id: userId,
    type: docType,
    file_name: file.name,
    file_path: filePath,
    file_url: signedData.signedUrl,
    status: 'pending',
  })

  if (insertErr) {
    console.error('[uploadDocument] DB insert error:', insertErr)
    // Best-effort Rollback: Datei aus Storage löschen, damit kein Ghost-Upload entsteht
    try {
      await supabase.storage.from('documents').remove([filePath])
    } catch {
      // Rollback-Fehler ignorieren, Haupt-Fehler ist wichtiger
    }
    return {
      ok: false,
      errorCode: 'db_error',
      errorMessage:
        'Das Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.',
    }
  }

  return { ok: true, url: signedData.signedUrl, path: filePath }
}

/**
 * Erzeugt on-demand eine frische signierte URL für ein bereits hochgeladenes
 * Dokument (der `documents`-Bucket ist privat). Nutzen, wenn eine in der DB
 * gespeicherte `file_url` abgelaufen ist — signiert über den gespeicherten
 * `file_path`.
 */
export async function getSignedDocumentUrl(
  filePath: string,
  expiresInSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, expiresInSeconds)
  if (error || !data?.signedUrl) {
    console.error('[getSignedDocumentUrl] Signed URL error:', error)
    return null
  }
  return data.signedUrl
}

/**
 * Entfernt problematische Zeichen aus Dateinamen (Leerzeichen, Umlaute, etc.)
 * die Supabase Storage manchmal nicht verarbeitet.
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100) // Max-Länge gegen Path-too-long
}
