// ═══════════════════════════════════════════════════════════════════════
// POST /api/location/update — eine Standortmeldung
// ═══════════════════════════════════════════════════════════════════════
//
// WER MELDET, ENTSCHEIDET DIE SITZUNG. Der Rumpf traegt Messwerte und
// sonst nichts: keine Konto-Kennung, keine Organisation, keine
// IP-Adresse, keine Plattform. Diese vier stehen in den Kopfzeilen bzw.
// in der Kontozuordnung und werden dort gelesen (gleiche Regel wie
// /api/security/app-start und lib/security/audit.ts).
//
// OHNE FREIGABE KEIN PUNKT — dreifach:
//   1. lib/standort/erfassung.ts prueft die Freigabe und, im
//      Einsatzmodus, den laufenden Einsatz.
//   2. Der Trigger auf location_updates prueft die Freigabe erneut in
//      der Datenbank.
//   3. Diese Route antwortet 409 statt 200, wenn eines von beiden
//      verneint — der Client soll merken, dass er aufhoeren kann.
//
// KEIN STILLES „OK". Anders als beim App-Start-Beacon wird hier NICHT
// mit 202 quittiert, wenn die Meldung verworfen wurde: ein Client, der
// glaubt, seine Punkte kaemen an, meldet weiter und verbraucht Akku
// fuer nichts.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { erfasseStandort } from '@/lib/standort'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 240 Punkte je Konto und Stunde — ein Punkt alle 15 Sekunden im
 * Dauerbetrieb. Das ist grosszuegig fuer eine Tour und eng genug, dass
 * ein fehlerhafter Client nicht in einer Nacht eine Million Zeilen
 * schreibt.
 *
 * Persistent, nicht die instanz-lokale Variante: auf Vercel laufen
 * mehrere Instanzen, und eine Zaehlung im Arbeitsspeicher ist dort
 * umgehbar (Befund „Rate-Limit-Map ist instanz-lokal").
 */
const GRENZE = 240
const FENSTER_MS = 3_600_000

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    if (!(await rateLimitPersistent(`standort:update:${user.id}`, GRENZE, FENSTER_MS))) {
      return NextResponse.json(
        { error: 'Zu viele Standortmeldungen. Bitte das Melde-Intervall vergrößern.' },
        { status: 429 },
      )
    }

    const rumpf = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!rumpf) {
      return NextResponse.json({ error: 'Ungültiger Anfragekörper.' }, { status: 400 })
    }

    const ergebnis = await erfasseStandort(
      createAdminClient(),
      user.id,
      {
        latitude: rumpf.latitude as number,
        longitude: rumpf.longitude as number,
        accuracyMeters: (rumpf.accuracyMeters ?? rumpf.accuracy) as number | null,
        altitude: rumpf.altitude as number | null,
        speed: rumpf.speed as number | null,
        heading: rumpf.heading as number | null,
        timestampUtc: (rumpf.timestampUtc ?? rumpf.timestamp) as string | null,
        sessionId: (rumpf.sessionId ?? rumpf.session_id) as string | null,
        serviceId: (rumpf.serviceId ?? rumpf.service_id) as string | null,
        appVersion: rumpf.appVersion as string | null,
      },
      request,
    )

    if (!ergebnis.ok) {
      return NextResponse.json({ error: ergebnis.grund }, { status: ergebnis.status })
    }

    return NextResponse.json(
      { ok: true, id: ergebnis.id, modus: ergebnis.modus, serviceId: ergebnis.serviceId },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return safeApiError(err, request)
  }
})
