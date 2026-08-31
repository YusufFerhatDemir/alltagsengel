/**
 * POST /api/billing/dta/ruecklaeufer/upload
 *
 * Datei-Upload für SLGA/SLAA EDIFACT-Antwortdateien.
 * - Akzeptiert multipart/form-data mit Feld "datei"
 * - Parst EDIFACT via SLGA-Parser
 * - Speichert Originaldatei in Supabase Storage
 * - Importiert alle Nachrichten via importiereRuecklaeufer()
 */

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { parseSlgaDatei } from '@/lib/abrechnung/slga-parser'
import { importiereRuecklaeufer } from '@/lib/abrechnung/ruecklaeufer'
import { erstelleFrist } from '@/lib/abrechnung/fristen-manager'
import type { RuecklaeuferImportErgebnis } from '@/lib/abrechnung/ruecklaeufer'
import { sanitizeStorageName } from '@/lib/file-upload-validation'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api:billing')

// Der Bucket `dta-dateien` erlaubt serverseitig 10 MB. Hier wird dieselbe
// Grenze VOR dem Einlesen geprueft: `arrayBuffer()` zieht die Datei sonst
// erst vollstaendig in den Speicher der Serverless-Funktion, bevor der
// Storage sie ablehnt.
const MAX_RUECKLAEUFER_BYTES = 10 * 1024 * 1024

// sanitizeFileName entfernt — zentralisiert in lib/file-upload-validation.ts (sanitizeStorageName)

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireOpsAdmin('abrechnung.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const formData = await request.formData()
    const datei = formData.get('datei') as File | null
    const laufId = formData.get('lauf_id') as string | null

    if (!datei) {
      return NextResponse.json(
        { error: 'Feld "datei" ist ein Pflichtfeld.' },
        { status: 400 },
      )
    }

    if (datei.size > MAX_RUECKLAEUFER_BYTES) {
      return NextResponse.json(
        { error: `Datei zu gross (max. ${MAX_RUECKLAEUFER_BYTES / 1024 / 1024} MB).` },
        { status: 413 },
      )
    }

    // Dateiinhalt lesen
    const bytes = await datei.arrayBuffer()
    const rohtext = new TextDecoder('iso-8859-1').decode(bytes)

    if (!rohtext.trim()) {
      return NextResponse.json(
        { error: 'Datei ist leer.' },
        { status: 400 },
      )
    }

    // In Supabase Storage speichern
    const admin = createAdminClient()
    const dateiPfad = `ruecklaeufer/${organizationId}/${Date.now()}_${sanitizeStorageName(datei.name, { maxLen: 120, fallback: 'ruecklaeufer.txt' })}`

    const { error: uploadError } = await admin.storage
      .from('dta-dateien')
      .upload(dateiPfad, bytes, {
        contentType: datei.type || 'application/octet-stream',
        upsert: false,
      })

    let quelldateiUrl: string | undefined
    if (uploadError) {
      // Storage-Fehler ist nicht kritisch — Import geht trotzdem
      log.error('Storage-Upload fehlgeschlagen', { errorMessage: uploadError.message, scope: 'ruecklaeufer-upload' })
    } else {
      // KEIN getPublicUrl(): `dta-dateien` ist ein privater Bucket, die so
      // erzeugte URL laeuft ins Leere und taeuscht einen abrufbaren Beleg
      // vor. Gespeichert wird der Storage-Pfad; eine signierte URL erzeugt
      // erst der Lesepfad, mit Ablaufzeit und Rechtepruefung.
      quelldateiUrl = dateiPfad
    }

    // EDIFACT parsen
    const { antwort, importe } = parseSlgaDatei(
      rohtext, organizationId, userId,
      datei.name, quelldateiUrl,
      laufId || undefined,
    )

    if (importe.length === 0 && antwort.warnungen.length > 0) {
      return NextResponse.json({
        error: 'Keine Rückläufer aus der Datei extrahiert.',
        warnungen: antwort.warnungen,
        absenderIk: antwort.absenderIk,
        empfaengerIk: antwort.empfaengerIk,
      }, { status: 422 })
    }

    // Jeden Import einzeln verarbeiten
    const ergebnisse: RuecklaeuferImportErgebnis[] = []
    const importFehler: string[] = []

    for (const importParams of importe) {
      try {
        const ergebnis = await importiereRuecklaeufer(admin, importParams)
        ergebnisse.push(ergebnis)

        // Frist erstellen für Fehler-Rückläufer
        if (['technischer_fehler', 'fachlicher_fehler', 'abgelehnt', 'teilweise_abgelehnt', 'korrektur_erforderlich'].includes(ergebnis.status)) {
          await erstelleFrist(admin, {
            organizationId,
            aufgabeId: ergebnis.aufgabeId || undefined,
            ruecklaeuferId: ergebnis.ruecklaeuferId,
            fristTyp: ergebnis.status,
            actorId: userId,
          }).catch((err) => log.warnWithException('Frist-Erstellung fehlgeschlagen (non-blocking)', err, { scope: 'DTA-Ruecklaeufer' }))
        }
      } catch (err) {
        importFehler.push((err as Error).message)
      }
    }

    // Zusammenfassung
    const zusammenfassung = {
      dateiName: datei.name,
      dateiGroesse: datei.size,
      nachrichtenGefunden: antwort.nachrichten.length,
      importeVerarbeitet: ergebnisse.length,
      importeFehler: importFehler.length,
      duplikate: ergebnisse.filter(e => e.status === 'duplikat').length,
      positionenGesamt: ergebnisse.reduce((s, e) => s + e.positionenGesamt, 0),
      positionenAngenommen: ergebnisse.reduce((s, e) => s + e.positionenAngenommen, 0),
      positionenAbgelehnt: ergebnisse.reduce((s, e) => s + e.positionenAbgelehnt, 0),
      absenderIk: antwort.absenderIk,
      empfaengerIk: antwort.empfaengerIk,
      warnungen: antwort.warnungen,
      fehler: importFehler,
    }

    return NextResponse.json({
      ...zusammenfassung,
      ergebnisse,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
