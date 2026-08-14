import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { hatAktiveEinwilligung } from '@/lib/coach/consent'
import {
  BEREITS_FREIGEGEBEN_CODE, BEREITS_FREIGEGEBEN_TEXT,
  EIGENE_EMAIL_CODE, EIGENE_EMAIL_TEXT,
  EMPFAENGER_ROLLEN,
  FREIGABE_CONSENT_FEHLT_CODE, FREIGABE_CONSENT_FEHLT_TEXT,
  KEIN_KONTO_CODE, KEIN_KONTO_TEXT,
  normalisiereEmail,
  type CoachFreigabeZeile,
} from '@/lib/coach/freigabe'

export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase.rpc('coach_freigaben_liste')
  if (error) return NextResponse.json({ error: 'Freigaben konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ freigaben: (data ?? []) as CoachFreigabeZeile[] })
}

/**
 * Neue Freigabe erteilen (oder eine widerrufene für dieselbe Person
 * reaktivieren — UNIQUE(owner_coach_user_id, grantee_user_id) lässt sonst
 * keine zweite Zeile zu).
 *
 * Reihenfolge der Prüfungen bewusst: erst die eigene Einwilligung (eigener
 * Fehler, sofort erkennbar), dann erst der Empfänger-Lookup (fremde Daten).
 */
export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const email = normalisiereEmail(body.email)
  if (!email) return NextResponse.json({ error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }, { status: 400 })
  if (!EMPFAENGER_ROLLEN.includes(body.empfaenger_rolle)) {
    return NextResponse.json({ error: 'Bitte wählen Sie, wem Sie freigeben (Angehörige/r oder Pflegedienst).' }, { status: 400 })
  }

  const { data: consents, error: consentFehler } = await auth.supabase
    .from('coach_consents')
    .select('consent_typ, erteilt, widerrufen_am')
    .eq('coach_user_id', auth.coachUser.id)
  if (consentFehler) {
    return NextResponse.json({ error: 'Ihre Einwilligung konnte nicht geprüft werden. Bitte später erneut versuchen.' }, { status: 503 })
  }
  if (!hatAktiveEinwilligung(consents ?? [], 'datenfreigabe')) {
    return NextResponse.json({ error: FREIGABE_CONSENT_FEHLT_TEXT, code: FREIGABE_CONSENT_FEHLT_CODE }, { status: 403 })
  }

  const { data: granteeId, error: lookupFehler } = await auth.supabase.rpc('coach_finde_nutzer_id', { p_email: email })
  if (lookupFehler) {
    return NextResponse.json({ error: 'Die Person konnte nicht gesucht werden. Bitte später erneut versuchen.' }, { status: 503 })
  }
  if (!granteeId) {
    return NextResponse.json({ error: KEIN_KONTO_TEXT, code: KEIN_KONTO_CODE }, { status: 404 })
  }
  if (granteeId === auth.user.id) {
    return NextResponse.json({ error: EIGENE_EMAIL_TEXT, code: EIGENE_EMAIL_CODE }, { status: 400 })
  }

  // RLS (coach_shares_owner_all) erlaubt dem Eigentümer alle eigenen Zeilen —
  // auch widerrufene. Damit lässt sich unterscheiden: neu anlegen oder
  // reaktivieren, statt an der UNIQUE-Constraint zu scheitern.
  const { data: bestehend, error: bestehendFehler } = await auth.supabase
    .from('coach_shares')
    .select('id, widerrufen_am')
    .eq('owner_coach_user_id', auth.coachUser.id)
    .eq('grantee_user_id', granteeId)
    .maybeSingle()
  if (bestehendFehler) {
    return NextResponse.json({ error: 'Freigabe konnte nicht angelegt werden.' }, { status: 500 })
  }

  if (bestehend && bestehend.widerrufen_am === null) {
    return NextResponse.json({ error: BEREITS_FREIGEGEBEN_TEXT, code: BEREITS_FREIGEGEBEN_CODE }, { status: 409 })
  }

  if (bestehend) {
    const { error: reaktivierenFehler } = await auth.supabase
      .from('coach_shares')
      .update({ empfaenger_rolle: body.empfaenger_rolle, erstellt_am: new Date().toISOString(), widerrufen_am: null })
      .eq('id', bestehend.id)
    if (reaktivierenFehler) {
      return NextResponse.json({ error: 'Freigabe konnte nicht reaktiviert werden.' }, { status: 500 })
    }
  } else {
    const { error: anlegenFehler } = await auth.supabase
      .from('coach_shares')
      .insert({
        owner_coach_user_id: auth.coachUser.id,
        grantee_user_id: granteeId,
        empfaenger_rolle: body.empfaenger_rolle,
      })
    if (anlegenFehler) {
      return NextResponse.json({ error: 'Freigabe konnte nicht angelegt werden.' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
