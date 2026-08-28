import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api/admin/ocr')

// ═══════════════════════════════════════════════════════════════
// POST /api/admin/ocr
// ═══════════════════════════════════════════════════════════════
// Nimmt das Ergebnis eines client-seitigen Tesseract-OCR-Laufs
// entgegen (Bild liegt bereits im Storage-Bucket `service-proofs`),
// speichert einen ocr_results-Datensatz und vergleicht die extrahierten
// Felder gegen den verknüpften service_records-Datensatz. Abweichungen
// und eine fehlende Unterschrift werden als review_errors protokolliert.
//
// Body:
//   {
//     service_record_id: string
//     image_url: string
//     raw_text: string
//     extracted: { date?: string; times?: string[]; amounts?: number[] }
//     confidence: number   // Tesseract result.data.confidence (0-100)
//   }
// ═══════════════════════════════════════════════════════════════

interface Extracted {
  date?: string | null
  times?: string[]
  amounts?: number[]
}

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !rolleDarf(profile.role, 'einsatz.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 })
    }

    const body = await request.json()
    const {
      service_record_id,
      image_url,
      raw_text,
      extracted,
      confidence,
    }: {
      service_record_id: string
      image_url: string
      raw_text: string
      extracted: Extracted
      confidence: number
    } = body

    if (!service_record_id || !image_url) {
      return NextResponse.json({ error: 'service_record_id und image_url erforderlich' }, { status: 400 })
    }

    const orgId = await getActiveOrgId()
    // Fail-closed (Audit MITTEL-1)
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen' }, { status: 403 })
    const admin = createAdminClient()

    // ── 1) Verknüpften Leistungsnachweis laden — org-fenced ──
    const { data: record, error: recErr } = await admin
      .from('service_records')
      .select('id, date, start_time, end_time, amount')
      .eq('id', service_record_id)
      .eq('organization_id', orgId)
      .single()

    if (recErr || !record) {
      return NextResponse.json({ error: 'Leistungsnachweis nicht gefunden' }, { status: 404 })
    }

    // ── 2) ocr_results-Eintrag anlegen ──
    const confidenceNum = typeof confidence === 'number' ? confidence : 0
    const ocrStatus = confidenceNum < 70 ? 'needs_review' : 'processed'

    // Dienstschluessel statt RLS-Client — zwei Gruende, beide live belegt:
    //
    //  1) Auf ocr_results und review_errors steht als einzige schreibende
    //     Policy `*_admin_all` mit is_admin(), und is_admin() ist live auf
    //     admin|superadmin beschraenkt (aus pg_proc gelesen). Diese Route
    //     laesst ueber 'einsatz.schreiben' aber auch die PDL herein — also
    //     genau die Rolle, die in einem Pflegedienst die Pruefzentrale
    //     bedient. Fuer sie scheiterte der Insert an 42501 und die Route
    //     meldete 500.
    //  2) organization_id ist NOT NULL mit Default current_org_id(). Die
    //     Funktion liest auth.uid(); beim Dienstschluessel gibt es keinen
    //     angemeldeten Nutzer und die Fallback-Kette endet in der fest
    //     verdrahteten Stamm-Organisation. Deshalb wird die Organisation
    //     hier ausdruecklich gesetzt — dieselbe, gegen die der Nachweis
    //     oben schon gefenced wurde.
    const { data: ocrResult, error: ocrErr } = await admin
      .from('ocr_results')
      .insert({
        service_record_id,
        organization_id: orgId,
        image_url,
        raw_text: raw_text || '',
        extracted: extracted || {},
        confidence: confidenceNum,
        engine: 'tesseract',
        status: ocrStatus,
      })
      .select()
      .single()

    if (ocrErr || !ocrResult) {
      return safeApiError(ocrErr, request)
    }

    // ── 3) Abgleich extrahierter Felder vs. Leistungsnachweis ──
    const createdErrors: any[] = []

    // Zeit-Abgleich: erste erkannte Zeitspanne gegen start_time/end_time
    if (extracted?.times && extracted.times.length > 0 && record.start_time && record.end_time) {
      const recStart = String(record.start_time).slice(0, 5)
      const recEnd = String(record.end_time).slice(0, 5)
      const matchesAny = extracted.times.some(t => {
        const [ts, te] = t.split('-').map(s => s.trim())
        return ts === recStart && te === recEnd
      })
      if (!matchesAny) {
        createdErrors.push({
          service_record_id,
          ocr_result_id: ocrResult.id,
          error_type: 'time_mismatch',
          severity: 'warning',
          description: `Erkannte Zeit(en) auf dem Foto (${extracted.times.join(', ')}) weichen von der erfassten Zeit (${recStart}–${recEnd}) ab.`,
        })
      }
    }

    // Betrag-Abgleich: einer der erkannten Beträge muss (annähernd) passen
    if (extracted?.amounts && extracted.amounts.length > 0 && record.amount != null) {
      const recAmount = Number(record.amount)
      const matchesAny = extracted.amounts.some(a => Math.abs(a - recAmount) < 0.01)
      if (!matchesAny) {
        createdErrors.push({
          service_record_id,
          ocr_result_id: ocrResult.id,
          error_type: 'amount_mismatch',
          severity: 'warning',
          description: `Erkannte Beträge auf dem Foto (${extracted.amounts.map(a => a.toFixed(2)).join(', ')} €) weichen vom erfassten Betrag (${recAmount.toFixed(2)} €) ab.`,
        })
      }
    }

    // Datum-Abgleich
    if (extracted?.date && record.date) {
      const recDate = String(record.date).slice(0, 10)
      if (extracted.date !== recDate) {
        createdErrors.push({
          service_record_id,
          ocr_result_id: ocrResult.id,
          error_type: 'other',
          severity: 'info',
          description: `Erkanntes Datum auf dem Foto (${extracted.date}) weicht vom erfassten Datum (${recDate}) ab.`,
        })
      }
    }

    // Geringe OCR-Konfidenz separat protokollieren
    if (confidenceNum < 70) {
      createdErrors.push({
        service_record_id,
        ocr_result_id: ocrResult.id,
        error_type: 'ocr_low_confidence',
        severity: 'warning',
        description: `OCR-Konfidenz niedrig (${confidenceNum.toFixed(0)}%). Bitte Foto und erfasste Daten manuell prüfen.`,
      })
    }

    // ── 4) Unterschrift-Prüfung ──
    const { count: sigCount } = await admin
      .from('service_signatures')
      .select('id', { count: 'exact', head: true })
      .eq('service_record_id', service_record_id)

    if (!sigCount || sigCount === 0) {
      createdErrors.push({
        service_record_id,
        ocr_result_id: ocrResult.id,
        error_type: 'signature_missing',
        severity: 'critical',
        description: 'Für diesen Leistungsnachweis liegt noch keine digitale Unterschrift (Klient/Betreuungskraft) vor.',
      })
    }

    // FAIL-CLOSED. Die Befunde SIND das Ergebnis dieser Pruefung — darunter
    // 'signature_missing' mit severity 'critical', also der Hinweis, dass
    // fuer einen Einsatz ueberhaupt keine Unterschrift vorliegt. Bisher
    // wurde ein fehlgeschlagener Insert nur geloggt und die Route
    // antwortete 200 mit `review_errors: []`: die Oberflaeche meldete dem
    // Buero eine bestandene Pruefung, waehrend die Beanstandungen nirgends
    // ankamen. Schlaegt der Eintrag fehl, wird der ocr_results-Datensatz
    // wieder entfernt (sonst bliebe ein Pruefvorgang ohne seine Befunde
    // stehen) und die Route antwortet 503 mit Klartext.
    let insertedErrors: any[] = []
    if (createdErrors.length > 0) {
      const { data: errData, error: errInsErr } = await admin
        .from('review_errors')
        .insert(createdErrors.map(e => ({ ...e, organization_id: orgId })))
        .select()
      if (errInsErr) {
        log.errorWithException('review_errors insert error', errInsErr)
        await admin.from('ocr_results').delete().eq('id', ocrResult.id)
        return NextResponse.json({
          error: 'Die Prüfbefunde konnten nicht gespeichert werden — der Prüfvorgang wurde zurückgenommen. '
            + 'Bitte erneut versuchen; ohne gespeicherte Befunde wäre die Prüfung nicht nachweisbar.',
        }, { status: 503 })
      }
      insertedErrors = errData || []
    }

    return NextResponse.json({ ocr_result: ocrResult, review_errors: insertedErrors })
  } catch (err: any) {
    return safeApiError(err, request)
  }
})
