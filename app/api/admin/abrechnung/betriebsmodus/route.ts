/**
 * Test-/Produktionsumschalter je Übertragungskanal.
 *
 * GET  → aktueller Modus aller Kanäle + Verlauf der Umschaltungen
 * POST → umschalten
 *
 * Das Umschalten auf Echtbetrieb ist der Moment, ab dem erzeugte Dateien bei
 * der Kasse eine Forderung auslösen. Die gesamte Prüflogik liegt deshalb in
 * lib/abrechnung/betriebsmodus.ts — dort ist sie ohne Datenbank testbar. Diese
 * Route nimmt entgegen, reicht durch und übersetzt Fehler in Statuscodes.
 */

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import {
  alleBetriebsmodi, ladeBetriebsmodusHistorie, setzeBetriebsmodus,
  BETRIEBS_KANAELE, BESTAETIGUNG_ECHTBETRIEB, KANAL_LABEL,
  type BetriebsKanal, type Betriebsmodus,
} from '@/lib/abrechnung/betriebsmodus'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireAdminMitOrg('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const [kanaele, historie] = await Promise.all([
      alleBetriebsmodi(admin, auth.organizationId),
      ladeBetriebsmodusHistorie(admin, auth.organizationId),
    ])

    return NextResponse.json({
      kanaele,
      historie,
      labels: KANAL_LABEL,
      bestaetigungswort: BESTAETIGUNG_ECHTBETRIEB,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireAdminMitOrg('system.verwalten')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    const kanal = body?.kanal as BetriebsKanal
    if (!BETRIEBS_KANAELE.includes(kanal)) {
      return NextResponse.json(
        { error: `Unbekannter Kanal "${body?.kanal}". Erlaubt: ${BETRIEBS_KANAELE.join(', ')}` },
        { status: 400 },
      )
    }

    const zielModus = body?.modus as Betriebsmodus
    if (zielModus !== 'test' && zielModus !== 'produktion') {
      return NextResponse.json(
        { error: 'modus muss "test" oder "produktion" sein.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const ergebnis = await setzeBetriebsmodus(admin, {
      organizationId: auth.organizationId,
      actorId: auth.userId,
      kanal,
      zielModus,
      begruendung: String(body?.begruendung ?? ''),
      bestaetigung: body?.bestaetigung ? String(body.bestaetigung) : undefined,
      testuebertragungAm: body?.testuebertragung_am ? String(body.testuebertragung_am) : undefined,
      testuebertragungReferenz: body?.testuebertragung_referenz ? String(body.testuebertragung_referenz) : undefined,
      testuebertragungStelle: body?.testuebertragung_stelle ? String(body.testuebertragung_stelle) : undefined,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    // Eine abgelehnte Umschaltung ist kein Serverfehler, sondern die Antwort
    // auf eine unvollständige Anfrage — 400, damit die Oberfläche den
    // Klartext anzeigt statt "Interner Fehler".
    const message = (err as Error).message
    const fachlich = /Pflicht|Bestätigung|nicht möglich|Begründung|Format/i.test(message)
    return NextResponse.json({ error: message }, { status: fachlich ? 400 : 500 })
  }
})
