/**
 * GET  /api/onboarding/fortschritt?typ=…   eigenen Stand lesen (legt ihn an)
 * POST /api/onboarding/fortschritt         Schritt speichern oder Abbruch merken
 *
 * ── DIESE ROUTEN GEHOEREN DER PERSON, NICHT DER VERWALTUNG ─────────────
 * Deshalb stehen sie BEWUSST NICHT in lib/auth/bereiche.ts: dort wird der
 * Zugriff auf Verwaltungsbereiche nach Berechtigungen geregelt. Hier gibt
 * es keine Berechtigung zu pruefen — es gibt nur die Frage, WER fragt.
 * Die Antwort ist immer der eigene Stand: die user_id kommt aus der
 * Sitzung und NIE aus dem Anfragekoerper. Ein Aufrufer kann damit weder
 * einen fremden Fortschritt lesen noch beschreiben.
 *
 * ── DIENSTSCHLUESSEL, ABER GEBUNDEN ────────────────────────────────────
 * Geschrieben wird mit dem Dienstschluessel (RLS greift dort nicht), weil
 * die Zeile organization_id tragen muss und profiles diese Spalte nicht
 * hat. Die Bindung an die Person passiert deshalb hier im Code — bei
 * jedem einzelnen Aufruf, nicht einmal am Anfang.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'
import { logger } from '@/lib/logger'
import {
  holeOderStarte, merkeAbbruch, speichereSchritt,
  OnboardingAbgeschlossenError, OnboardingNichtLesbarError,
} from '@/lib/onboarding/service'
import { istOnboardingTyp, istSchrittStatus } from '@/lib/onboarding/schritte'

const log = logger.child('api:onboarding')

/** Sitzung aufloesen. Ohne Konto gibt es keinen Stand — 401, kein Rateraten. */
async function holeNutzer() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return { userId: user.id, organizationId: await getActiveOrgIdOrDefault() }
}

function nichtAngemeldet() {
  return NextResponse.json(
    { error: 'Bitte melden Sie sich an, um Ihren Stand zu speichern.' },
    { status: 401 },
  )
}

export const GET = withTracking(async function GET(request: Request) {
  const nutzer = await holeNutzer()
  if (!nutzer) return nichtAngemeldet()

  const typ = new URL(request.url).searchParams.get('typ')
  if (!istOnboardingTyp(typ)) {
    return NextResponse.json({ error: 'Unbekannte Ablaufart.' }, { status: 400 })
  }

  try {
    const fortschritt = await holeOderStarte(createAdminClient(), { ...nutzer, typ })
    return NextResponse.json({ fortschritt })
  } catch (err) {
    if (err instanceof OnboardingNichtLesbarError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    log.errorWithException('Fortschritt lesen', err)
    return NextResponse.json({ error: 'Ihr Stand konnte nicht geladen werden.' }, { status: 500 })
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const nutzer = await holeNutzer()
  if (!nutzer) return nichtAngemeldet()

  const koerper = await request.json().catch(() => null)
  if (!koerper || typeof koerper !== 'object') {
    return NextResponse.json({ error: 'Ungültiger Anfragekörper.' }, { status: 400 })
  }

  const { typ, schritt, schluessel, daten, status, abbruchstelle } = koerper as Record<string, unknown>
  if (!istOnboardingTyp(typ)) {
    return NextResponse.json({ error: 'Unbekannte Ablaufart.' }, { status: 400 })
  }

  const kennung = { ...nutzer, typ }

  try {
    const admin = createAdminClient()

    // Nur eine Abbruchmarke, kein Schritt: „Später fortsetzen" hat den
    // Schritt bereits im selben Zug gespeichert.
    if (abbruchstelle !== undefined && schritt === undefined) {
      await merkeAbbruch(admin, kennung, String(abbruchstelle).slice(0, 120))
      return NextResponse.json({ ok: true })
    }

    const nummer = Number(schritt)
    if (!Number.isInteger(nummer) || nummer < 1) {
      return NextResponse.json({ error: 'Schrittnummer fehlt oder ist ungültig.' }, { status: 400 })
    }
    if (status !== undefined && !istSchrittStatus(status)) {
      return NextResponse.json({ error: 'Unbekannter Schrittstatus.' }, { status: 400 })
    }

    const fortschritt = await speichereSchritt(admin, kennung, {
      schritt: nummer,
      daten: (daten ?? {}) as Record<string, unknown>,
      status: status as never,
    })

    // Der Schlüssel aus dem Anfragekörper wird bewusst NICHT verwendet —
    // maßgeblich ist die Schrittfolge im Code. Er wird nur zurückgemeldet,
    // damit ein Missverständnis auffällt statt still zu wirken.
    return NextResponse.json({ fortschritt, gemeldeterSchluessel: schluessel ?? null })
  } catch (err) {
    if (err instanceof OnboardingAbgeschlossenError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof RangeError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    if (err instanceof OnboardingNichtLesbarError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof Error && /nicht ueberspringbar/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    log.errorWithException('Schritt speichern', err)
    return NextResponse.json({ error: 'Das Speichern hat nicht geklappt.' }, { status: 500 })
  }
})
