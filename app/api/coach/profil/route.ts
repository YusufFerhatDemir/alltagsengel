import { NextResponse } from 'next/server'
import { requireCoachSession, requireCoachUser } from '@/lib/coach/api-auth'
import { hatAktiveEinwilligung, PFLICHT_CONSENT } from '@/lib/coach/consent'
import type { CoachRolle, CoachSchriftgrad } from '@/lib/coach/types'
import { withTracking } from '@/lib/monitoring/tracker'

const ROLLEN: CoachRolle[] = ['pflegebeduerftig', 'angehoerig', 'pflegedienst']
const SCHRIFTGRADE: CoachSchriftgrad[] = ['normal', 'gross', 'sehr_gross']

/**
 * Eigenes PflegeCoach-Profil laden (null, wenn Onboarding noch aussteht).
 *
 * Liefert zusätzlich `einwilligung_aktiv`: Der Client muss wissen, ob die
 * Pflicht-Einwilligung (Art. 9) noch gilt — nur so kann er den gesperrten
 * Zustand erklären, statt den Nutzer erst beim Speichern in einen 403
 * laufen zu lassen. Ohne Profil ist das Feld `false` (es gibt dann noch
 * keine Einwilligung; das Onboarding holt sie ein).
 */
export const GET = withTracking(async function GET() {
  const session = await requireCoachSession()
  if (!session.ok) return session.response

  const { data, error } = await session.supabase
    .from('coach_users')
    .select('*')
    .eq('user_id', session.user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Profil konnte nicht geladen werden.' }, { status: 500 })
  if (!data) return NextResponse.json({ profil: null, einwilligung_aktiv: false })

  const { data: consents, error: consentFehler } = await session.supabase
    .from('coach_consents')
    .select('consent_typ, erteilt, widerrufen_am')
    .eq('coach_user_id', data.id)

  if (consentFehler) {
    return NextResponse.json({ error: 'Profil konnte nicht geladen werden.' }, { status: 500 })
  }

  return NextResponse.json({
    profil: data,
    einwilligung_aktiv: hatAktiveEinwilligung(consents ?? [], PFLICHT_CONSENT),
  })
})

/** Onboarding: Profil anlegen (einmalig, user_id ist UNIQUE). */
export const POST = withTracking(async function POST(request: Request) {
  const session = await requireCoachSession()
  if (!session.ok) return session.response

  const body = await request.json().catch(() => ({}))
  if (!ROLLEN.includes(body.rolle)) {
    return NextResponse.json({ error: 'Bitte eine gültige Rolle wählen.' }, { status: 400 })
  }
  const pflegegrad = body.pflegegrad == null ? null : Number(body.pflegegrad)
  if (pflegegrad !== null && !(pflegegrad >= 1 && pflegegrad <= 5)) {
    return NextResponse.json({ error: 'Pflegegrad muss zwischen 1 und 5 liegen.' }, { status: 400 })
  }
  const geburtsjahr = body.geburtsjahr == null ? null : Number(body.geburtsjahr)
  if (geburtsjahr !== null && (!Number.isInteger(geburtsjahr) || geburtsjahr < 1900 || geburtsjahr > 2030)) {
    return NextResponse.json({ error: 'Geburtsjahr muss zwischen 1900 und 2030 liegen.' }, { status: 400 })
  }

  const { data, error } = await session.supabase
    .from('coach_users')
    .insert({
      user_id: session.user.id,
      rolle: body.rolle,
      anzeigename: typeof body.anzeigename === 'string' ? body.anzeigename.slice(0, 120) : null,
      pflegegrad,
      geburtsjahr,
    })
    .select()
    .single()

  if (error) {
    const doppelt = error.code === '23505'
    return NextResponse.json(
      { error: doppelt ? 'Es existiert bereits ein PflegeCoach-Profil.' : 'Profil konnte nicht angelegt werden.' },
      { status: doppelt ? 409 : 400 }
    )
  }
  return NextResponse.json({ profil: data })
})

/** Profil-/Barrierefreiheits-Einstellungen ändern. */
export const PATCH = withTracking(async function PATCH(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (body.anzeigename !== undefined) update.anzeigename = typeof body.anzeigename === 'string' ? body.anzeigename.slice(0, 120) : null
  if (body.pflegegrad !== undefined) {
    const pg = body.pflegegrad == null ? null : Number(body.pflegegrad)
    if (pg !== null && !(pg >= 1 && pg <= 5)) return NextResponse.json({ error: 'Pflegegrad muss zwischen 1 und 5 liegen.' }, { status: 400 })
    update.pflegegrad = pg
  }
  if (body.a11y_schriftgrad !== undefined) {
    if (!SCHRIFTGRADE.includes(body.a11y_schriftgrad)) return NextResponse.json({ error: 'Ungültiger Schriftgrad.' }, { status: 400 })
    update.a11y_schriftgrad = body.a11y_schriftgrad
  }
  if (body.a11y_kontrast !== undefined) update.a11y_kontrast = Boolean(body.a11y_kontrast)
  if (body.onboarding_abgeschlossen !== undefined) update.onboarding_abgeschlossen = Boolean(body.onboarding_abgeschlossen)

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Keine änderbaren Felder übergeben.' }, { status: 400 })

  const { data, error } = await auth.supabase
    .from('coach_users')
    .update(update)
    .eq('id', auth.coachUser.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Profil konnte nicht aktualisiert werden.' }, { status: 400 })
  return NextResponse.json({ profil: data })
})
