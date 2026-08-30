// ═══════════════════════════════════════════════════════════════════════
// /api/location/settings — die eigene Standortfreigabe
// ═══════════════════════════════════════════════════════════════════════
//
// GET — die eigene Einstellung lesen
// PUT — den eigenen Modus setzen
//
// WESSEN EINSTELLUNG: die des angemeldeten Kontos. Es gibt keinen
// Parameter dafuer und keine Kennung im Rumpf. Eine Route, die eine
// fremde Kennung entgegennaehme, waere der Weg, ueber den sich die
// Standortfreigabe fuer eine andere Person einschalten liesse — und
// genau das schliesst dieses Modul aus.
//
// ES GIBT KEINE VERWALTUNGSROUTE ZUM EINSCHALTEN. Auch nicht fuer
// admin/superadmin. Wer die Aufsichtsansicht sehen darf, darf die
// Freigabe trotzdem nicht erteilen — sie ist eine Erklaerung der
// betroffenen Person, keine Einstellung des Betriebs.
//
// ABSCHALTEN GEHT IMMER. PUT mit mode='off' prueft nichts ausser der
// Sitzung: kein Rate-Limit, keine Betriebssystem-Berechtigung, keine
// bestehende Zeile. Und es gibt den Weg an dieser Route vorbei — die
// RLS-Policy `standort_freigabe_selbst_abschalten` erlaubt dem
// Browser-Client, `mode` direkt auf 'off' zu setzen.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import {
  leseEinstellung, setzeEinstellung,
  BEZEICHNUNG_MODUS, ERKLAERUNG_MODUS, MODI, MODUS_AUS, istModus,
} from '@/lib/standort'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Nur fuer das EINSCHALTEN. Zwoelf Aenderungen je Stunde reichen fuer
 * jedes vernuenftige Hin und Her und verhindern, dass sich jemand mit
 * Moduswechseln eine Ereignisflut in die Sicherheitsspur schreibt.
 * Das Abschalten laeuft an dieser Grenze vorbei.
 */
const EINSCHALT_GRENZE = 12
const EINSCHALT_FENSTER_MS = 3_600_000

const KATALOG = MODI.map(m => ({
  wert: m,
  bezeichnung: BEZEICHNUNG_MODUS[m],
  erklaerung: ERKLAERUNG_MODUS[m],
}))

export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const einstellung = await leseEinstellung(createAdminClient(), user.id)

    return NextResponse.json(
      { einstellung, katalog: KATALOG },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const PUT = withTracking(async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const rumpf = await request.json().catch(() => null) as {
      mode?: unknown
      enabledByUser?: unknown
      osPermissionGranted?: unknown
    } | null

    const modus = rumpf?.mode
    if (!istModus(modus)) {
      return NextResponse.json(
        { error: `Unbekannter Modus. Erlaubt: ${MODI.join(', ')}.` },
        { status: 400 },
      )
    }

    if (modus !== MODUS_AUS) {
      if (!(await rateLimitPersistent(
        `standort:einstellung:${user.id}`, EINSCHALT_GRENZE, EINSCHALT_FENSTER_MS,
      ))) {
        return NextResponse.json(
          { error: 'Zu viele Änderungen in kurzer Zeit. Bitte später erneut versuchen.' },
          { status: 429 },
        )
      }
    }

    const ergebnis = await setzeEinstellung(createAdminClient(), {
      userId: user.id,
      modus,
      // KEIN Vorgabewert: nur ein ausdrueckliches true zaehlt als
      // eigene Aktivierung. Ein fehlendes Feld ist keine Zustimmung.
      enabledByUser: rumpf?.enabledByUser === true,
      osPermissionGranted: rumpf?.osPermissionGranted === true,
      request,
    })

    if (!ergebnis.ok) {
      return NextResponse.json({ error: ergebnis.grund }, { status: 400 })
    }

    return NextResponse.json(
      { einstellung: ergebnis.einstellung, vorher: ergebnis.vorher, katalog: KATALOG },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return safeApiError(err, request)
  }
})
