import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'

// ═══════════════════════════════════════════════════════════════
// POST /api/native/leistungsnachweis-upload
// ═══════════════════════════════════════════════════════════════
// Bridge für die Expo-App: nimmt ein Foto des Leistungsnachweises
// (base64) entgegen, prüft die Betreuungskraft-Session, lädt das Bild
// serverseitig (service_role) in den privaten Bucket `service-proofs`
// hoch und legt einen ocr_results-Eintrag (status='pending') an — die
// eigentliche Texterkennung läuft weiterhin über die admin-seitige
// KI-Prüfzentrale (/api/admin/ocr), da die Native App kein OCR an Bord
// hat. Direkte Inserts aus der App sind laut RLS nicht erlaubt
// (ocr_results_service_all ist auf service_role beschränkt) — daher
// dieser dedizierte Server-Endpunkt.
//
// Body:
//   {
//     service_record_id: string
//     image_base64: string   // reines Base64, ohne data:-Prefix
//     mime_type?: string      // default image/jpeg
//   }
// ═══════════════════════════════════════════════════════════════

const MAX_IMAGE_BYTES = 15 * 1024 * 1024 // 15 MB, analog MAX_PROOF_SIZE_MB

export async function POST(request: Request) {
  try {
    const auth = await requireCaregiverSession(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const {
      service_record_id,
      image_base64,
      mime_type,
    }: { service_record_id?: string; image_base64?: string; mime_type?: string } = body

    if (!service_record_id || !image_base64) {
      return NextResponse.json(
        { error: 'service_record_id und image_base64 erforderlich' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // ── Eigentümer-Prüfung: der Leistungsnachweis muss der eigenen Betreuungskraft gehören ──
    const { data: record, error: recErr } = await admin
      .from('service_records')
      .select('id, caregiver_id')
      .eq('id', service_record_id)
      .single()

    if (recErr || !record) {
      return NextResponse.json({ error: 'Leistungsnachweis nicht gefunden' }, { status: 404 })
    }
    if (record.caregiver_id !== auth.caregiverId) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Leistungsnachweis' }, { status: 403 })
    }

    const contentType = mime_type || 'image/jpeg'
    const extension = contentType === 'image/png' ? 'png' : 'jpg'

    let buffer: Buffer
    try {
      buffer = Buffer.from(image_base64, 'base64')
    } catch {
      return NextResponse.json({ error: 'Ungültiges Bildformat' }, { status: 400 })
    }

    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Leeres Bild' }, { status: 400 })
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Bild zu groß (max. 15 MB)' }, { status: 400 })
    }

    const filePath = `${service_record_id}/${Date.now()}.${extension}`

    const { error: uploadErr } = await admin.storage
      .from('service-proofs')
      .upload(filePath, buffer, { contentType, cacheControl: '3600', upsert: false })

    if (uploadErr) {
      console.error('[api/native/leistungsnachweis-upload] Storage-Fehler:', uploadErr)
      return NextResponse.json({ error: 'Upload fehlgeschlagen' }, { status: 500 })
    }

    const { data: signedData } = await admin.storage
      .from('service-proofs')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7)

    const { data: ocrResult, error: ocrErr } = await admin
      .from('ocr_results')
      .insert({
        service_record_id,
        image_url: signedData?.signedUrl || filePath,
        status: 'pending',
      })
      .select()
      .single()

    if (ocrErr || !ocrResult) {
      console.error('[api/native/leistungsnachweis-upload] ocr_results-Fehler:', ocrErr)
      return NextResponse.json({ error: 'Foto gespeichert, aber Prüfeintrag fehlgeschlagen' }, { status: 500 })
    }

    return NextResponse.json({ success: true, ocr_result_id: ocrResult.id, path: filePath })
  } catch (err) {
    console.error('[api/native/leistungsnachweis-upload] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
