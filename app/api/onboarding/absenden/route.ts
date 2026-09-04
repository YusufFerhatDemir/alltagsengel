/**
 * POST /api/onboarding/absenden — die Bewerbung einreichen
 *
 * ── REIHENFOLGE IST HIER WICHTIG ───────────────────────────────────────
 * Erst die Bewerbung anlegen, DANN den Ablauf abschliessen. Andersherum
 * waere der Ablauf geschlossen und die Bewerbung fehlte — die Person
 * saehe „geschafft", die Verwaltung saehe nichts, und weil der Ablauf
 * abgeschlossen ist, faellt es auch keiner Erinnerung mehr auf.
 *
 * ── DOPPELTE EINREICHUNG ───────────────────────────────────────────────
 * Ein Doppelklick, ein zweiter Tab, ein wiederholter Request: der
 * Teil-Unique-Index uq_lead_inquiries_bewerbung_je_ablauf laesst nur EINE
 * Bewerbung je Ablauf zu. Der Konflikt (23505) wird hier als Erfolg
 * behandelt — die Bewerbung IST ja da.
 *
 * ── FEHLENDE ANGABEN HALTEN NICHT AUF ──────────────────────────────────
 * schliesseAb() verlangt die Pflichtschritte; darueber hinaus wird nichts
 * verlangt. Wer Unterlagen schuldig bleibt, kann trotzdem einreichen —
 * was fehlt, steht in der Bewerbung und wird nachgefragt.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'
import { rateLimitPersistent } from '@/lib/rate-limit-persistent'
import { istOnboardingTyp } from '@/lib/onboarding/schritte'
import {
  holeFortschritt, schliesseAb,
  OnboardingNichtLesbarError,
} from '@/lib/onboarding/service'
import { baueEinreichung } from '@/lib/onboarding/einreichung'
import { logger } from '@/lib/logger'

const log = logger.child('api:onboarding:absenden')

export const POST = withTracking(async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json(
      { error: 'Bitte melden Sie sich an, um Ihre Bewerbung abzusenden.' },
      { status: 401 },
    )
  }

  if (!(await rateLimitPersistent(`onboarding-absenden:${user.id}`, 5, 60 * 60 * 1000))) {
    return NextResponse.json(
      { error: 'Zu viele Versuche — bitte versuchen Sie es später erneut.' },
      { status: 429 },
    )
  }

  const koerper = await request.json().catch(() => null)
  const typ = (koerper as Record<string, unknown> | null)?.typ
  if (!istOnboardingTyp(typ)) {
    return NextResponse.json({ error: 'Unbekannte Ablaufart.' }, { status: 400 })
  }
  if (typ !== 'bewerber') {
    // Kunden- und Angehoerigenablauf reichen nichts ein; sie enden mit
    // dem Abschluss. Hier bewusst abgewiesen statt still nichts zu tun.
    return NextResponse.json(
      { error: 'Für diesen Ablauf gibt es kein Absenden.' },
      { status: 400 },
    )
  }

  const organizationId = await getActiveOrgIdOrDefault()
  const kennung = { userId: user.id, organizationId, typ }

  try {
    const admin = createAdminClient()

    const fortschritt = await holeFortschritt(admin, kennung)
    if (!fortschritt) {
      return NextResponse.json(
        { error: 'Es gibt noch keine Bewerbung zum Absenden.' },
        { status: 404 },
      )
    }

    // ── 1. Bewerbung anlegen ────────────────────────────────────────
    const einreichung = baueEinreichung({
      schritteDaten: fortschritt.schritteDaten,
      fehlendeAngaben: fortschritt.fehlendeAngaben,
      fortschrittId: fortschritt.id,
      organizationId,
    })

    const { error: schreibFehler } = await admin
      .from('lead_inquiries')
      // organization_id steht bereits in `einreichung` und wird hier
      // ausdruecklich wiederholt: der Mandant gehoert an einem
      // Dienstschluessel-Insert an die Aufrufstelle und nicht nur in
      // einen Hilfsbaustein — sonst faellt bei einer spaeteren Aenderung
      // still der Spalten-Default ein (npm run lint:org-id).
      .insert({ ...einreichung, organization_id: organizationId })

    // 23505 = der Riegel hat gegriffen: diese Bewerbung liegt bereits vor.
    if (schreibFehler && schreibFehler.code !== '23505') {
      log.errorWithException('Bewerbung nicht speicherbar', new Error(schreibFehler.message))
      return NextResponse.json(
        { error: 'Das Absenden hat nicht geklappt. Ihre Angaben sind gespeichert.' },
        { status: 500 },
      )
    }
    const bereitsEingereicht = schreibFehler?.code === '23505'

    // ── 2. Erst jetzt abschliessen ──────────────────────────────────
    await schliesseAb(admin, kennung)

    return NextResponse.json({ ok: true, bereitsEingereicht })
  } catch (err) {
    if (err instanceof OnboardingNichtLesbarError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof Error && /offene Pflichtschritte/.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    log.errorWithException('Absenden fehlgeschlagen', err)
    return NextResponse.json(
      { error: 'Das Absenden hat nicht geklappt. Ihre Angaben sind gespeichert.' },
      { status: 500 },
    )
  }
})
