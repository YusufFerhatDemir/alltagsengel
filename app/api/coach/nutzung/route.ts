// ═══════════════════════════════════════════════════════════════
// Pseudonymisierte Nutzungsereignisse (15a, Schritt 5 — Nachweise)
//
// DOPPELTE ABSICHERUNG vor jeder Erfassung:
//   1. Deployment-Schalter COACH_NUTZUNGSNACHWEIS_AKTIV (Default aus)
//   2. gültige Einwilligung 'wissenschaftliche_auswertung' des Nutzers
// Fehlt eines von beidem, wird nichts geschrieben — und zwar ohne Fehler,
// damit die Erfassung nie einen Nutzerablauf blockiert.
//
// Geschrieben wird über den Session-Client: die RLS-Policy erzwingt, dass
// das Pseudonym das eigene ist (coach_mein_pseudonym()).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { requireCoachUser } from '@/lib/coach/api-auth'
import { istNutzungsEreignis } from '@/lib/coach/nachweise'
import { nutzungsnachweisAktiv } from '@/lib/coach/config'

/** Eigene Nachweisdaten einsehen (Art. 15 DSGVO). */
export async function GET() {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const { data, error } = await auth.supabase
    .from('coach_nutzungsereignisse')
    .select('ereignis, modul_key, rolle, auswertungswoche, anzahl')
    .order('auswertungswoche', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: 'Nachweisdaten konnten nicht geladen werden.' }, { status: 500 })
  return NextResponse.json({ ereignisse: data ?? [], erfassungAktiv: nutzungsnachweisAktiv() })
}

// Bewusst OHNE `schreibzugriff`: Diese Route hat ihr eigenes, strengeres
// Tor (Deployment-Schalter + Einwilligung 'wissenschaftliche_auswertung')
// und antwortet bei fehlender Grundlage weich mit `erfasst: false`, statt
// mit 403. Ein 403 würde einen Nutzerablauf abbrechen, den die Erfassung
// nie beeinflussen darf.
export async function POST(request: Request) {
  const auth = await requireCoachUser()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  if (!istNutzungsEreignis(body.ereignis)) {
    return NextResponse.json({ error: 'Unbekannte Ereignisart.' }, { status: 400 })
  }

  if (!nutzungsnachweisAktiv()) {
    return NextResponse.json({ erfasst: false, grund: 'erfassung_inaktiv' })
  }

  // Einwilligung prüfen: erteilt und nicht widerrufen.
  const { data: consents, error: consentFehler } = await auth.supabase
    .from('coach_consents')
    .select('erteilt, widerrufen_am')
    .eq('coach_user_id', auth.coachUser.id)
    .eq('consent_typ', 'wissenschaftliche_auswertung')
    .eq('erteilt', true)
    .is('widerrufen_am', null)
    .limit(1)

  if (consentFehler) {
    return NextResponse.json({ error: 'Einwilligung konnte nicht geprüft werden.' }, { status: 500 })
  }
  if (!consents?.length) {
    return NextResponse.json({ erfasst: false, grund: 'keine_einwilligung' })
  }

  const { data: pseudonym, error: pseudoFehler } = await auth.supabase.rpc('coach_mein_pseudonym')
  if (pseudoFehler || !pseudonym) {
    return NextResponse.json({ error: 'Ereignis konnte nicht erfasst werden.' }, { status: 500 })
  }

  const { error } = await auth.supabase.from('coach_nutzungsereignisse').insert({
    pseudonym,
    ereignis: body.ereignis,
    modul_key: typeof body.modul_key === 'string' ? body.modul_key.slice(0, 80) : null,
    rolle: auth.coachUser.rolle,
  })

  if (error) return NextResponse.json({ error: 'Ereignis konnte nicht erfasst werden.' }, { status: 400 })
  return NextResponse.json({ erfasst: true })
}
