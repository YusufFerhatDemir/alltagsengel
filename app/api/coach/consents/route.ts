import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import type { ConsentTyp } from '@/lib/coach/types'

const CONSENT_TYPEN: ConsentTyp[] = ['gesundheitsdaten_art9', 'wissenschaftliche_auswertung', 'datenfreigabe']

/** Aktuelle Version der Einwilligungstexte — bei Textänderung hochzählen. */
export const CONSENT_TEXT_VERSION = '2026-08-v1'

export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_consents')
    .select('*')
    .eq('coach_user_id', auth.coachUser.id)
    .order('erteilt_am', { ascending: false })

  if (error) return NextResponse.json({ error: 'Einwilligungen konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ consents: data ?? [], textVersion: CONSENT_TEXT_VERSION })
}

/**
 * Einwilligung erteilen ODER widerrufen (append-only, versioniert):
 *  * erteilt=true  → neue Zeile mit aktueller Textversion
 *  * erteilt=false → Widerruf: offene Zeilen desselben Typs bekommen
 *    widerrufen_am, zusätzlich wird der Widerruf als eigene Zeile
 *    protokolliert (nachweisbar, Art. 7 Abs. 1/3 DSGVO).
 */
export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (!CONSENT_TYPEN.includes(body.consent_typ)) {
    return NextResponse.json({ error: 'Ungültiger Einwilligungs-Typ.' }, { status: 400 })
  }
  const erteilt = Boolean(body.erteilt)

  if (!erteilt) {
    const { error: widerrufFehler } = await auth.supabase
      .from('coach_consents')
      .update({ widerrufen_am: new Date().toISOString() })
      .eq('coach_user_id', auth.coachUser.id)
      .eq('consent_typ', body.consent_typ)
      .eq('erteilt', true)
      .is('widerrufen_am', null)
    if (widerrufFehler) {
      return NextResponse.json({ error: 'Widerruf konnte nicht gespeichert werden.' }, { status: 400 })
    }
  }

  const { data, error } = await auth.supabase
    .from('coach_consents')
    .insert({
      coach_user_id: auth.coachUser.id,
      consent_typ: body.consent_typ,
      text_version: CONSENT_TEXT_VERSION,
      erteilt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Einwilligung konnte nicht gespeichert werden.' }, { status: 400 })
  return NextResponse.json({ consent: data })
}
