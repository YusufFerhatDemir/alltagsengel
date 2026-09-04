/**
 * GET /api/admin/onboarding/dokument?fortschrittId=…&art=…
 *
 * Liefert eine KURZLEBIGE signierte URL zu einer hochgeladenen Unterlage.
 *
 * ── WARUM NUR SIGNIERT, UND WARUM KURZ ─────────────────────────────────
 * Der Bucket ist nicht öffentlich; ohne Signatur ist die Datei gar nicht
 * erreichbar. Aber auch eine signierte URL ist ein Schlüssel: wer sie
 * hat, kommt an das Dokument — ohne Anmeldung, ohne Rolle, ohne
 * Mandantenprüfung. Sie steht in Browserverläufen, in weitergeleiteten
 * Nachrichten und in Server-Logs von allem, was dazwischenliegt.
 *
 * Deshalb: fünf Minuten Gültigkeit, und sie wird nur auf Anforderung
 * erzeugt — nie im Voraus für eine ganze Liste. Wer eine Übersicht
 * öffnet, soll nicht zwanzig gültige Schlüssel geliefert bekommen, von
 * denen er einen anklickt.
 *
 * ── DER SPEICHERPFAD VERLÄSST DEN SERVER NIE ───────────────────────────
 * Zurück geht ausschließlich die signierte URL. Der Pfad selbst
 * (`onboarding/{org}/{user}/…`) verrät Mandanten- und Personen-IDs und
 * hat im Browser nichts zu suchen.
 *
 * ── DER MANDANT WIRD GEPRÜFT, NICHT ANGENOMMEN ─────────────────────────
 * Die Zeile wird über organization_id des Aufrufers gelesen. Ohne diese
 * Bedingung könnte eine Administration eines Mandanten die Unterlagen
 * eines anderen abrufen — der Storage kennt keine Mandantengrenze.
 */

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'

const log = logger.child('api:admin:onboarding:dokument')

const BUCKET = 'documents'
/** Fünf Minuten. Lang genug zum Öffnen, kurz genug zum Vergessen. */
const GUELTIG_SEKUNDEN = 300

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  const parameter = new URL(request.url).searchParams
  const fortschrittId = parameter.get('fortschrittId')
  const art = parameter.get('art')

  if (!fortschrittId || !art) {
    return NextResponse.json(
      { error: 'fortschrittId und art sind erforderlich.' },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()

    const { data: zeile, error } = await admin
      .from('onboarding_progress')
      .select('dokument_status')
      .eq('id', fortschrittId)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) {
      log.errorWithException('Ablauf nicht lesbar', new Error(error.message))
      return NextResponse.json({ error: 'Abruf nicht möglich.' }, { status: 500 })
    }
    if (!zeile) {
      // Gleiche Antwort für „gibt es nicht" und „gehört einem anderen
      // Mandanten" — sonst verrät der Unterschied, dass es die ID gibt.
      return NextResponse.json({ error: 'Unterlage nicht gefunden.' }, { status: 404 })
    }

    const status = (zeile.dokument_status ?? {}) as Record<string, { pfad?: string; dateiname?: string }>
    const eintrag = status[art]
    if (!eintrag?.pfad) {
      return NextResponse.json({ error: 'Unterlage nicht gefunden.' }, { status: 404 })
    }

    const { data: signiert, error: signaturFehler } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(eintrag.pfad, GUELTIG_SEKUNDEN)

    if (signaturFehler || !signiert?.signedUrl) {
      log.errorWithException(
        'Signierte URL nicht erzeugbar',
        new Error(signaturFehler?.message ?? 'keine URL'),
      )
      return NextResponse.json({ error: 'Abruf nicht möglich.' }, { status: 502 })
    }

    return NextResponse.json({
      url: signiert.signedUrl,
      dateiname: eintrag.dateiname ?? art,
      gueltigSekunden: GUELTIG_SEKUNDEN,
    })
  } catch (err) {
    log.errorWithException('Dokumentabruf fehlgeschlagen', err)
    return NextResponse.json({ error: 'Abruf nicht möglich.' }, { status: 500 })
  }
})
