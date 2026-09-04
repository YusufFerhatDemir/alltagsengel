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
import { baueAnfrage, baueEinreichung } from '@/lib/onboarding/einreichung'
import { logger } from '@/lib/logger'

const log = logger.child('api:onboarding:absenden')

/**
 * Name und Telefon aus dem Profil.
 *
 * Fail-soft: fehlt das Profil oder ist es nicht lesbar, entsteht die
 * Anfrage trotzdem — mit Platzhaltern, die baueAnfrage() setzt. Eine
 * Anfrage, die am fehlenden Nachnamen scheitert, ist fuer die Verwaltung
 * unsichtbar; das waere schlimmer als eine Zeile ohne Namen.
 */
async function holeKontakt(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  emailAusSitzung: string | null,
): Promise<{ name: string; telefon: string | null; email: string | null }> {
  try {
    const { data } = await admin
      .from('profiles')
      .select('first_name, last_name, phone, email')
      .eq('id', userId)
      .maybeSingle()

    const name = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim()
    return {
      name,
      telefon: (data?.phone as string | null) ?? null,
      email: (data?.email as string | null) ?? emailAusSitzung,
    }
  } catch {
    return { name: '', telefon: null, email: emailAusSitzung }
  }
}

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
  if (typ !== 'bewerber' && typ !== 'kunde') {
    // Der Angehoerigenablauf reicht nichts ein; er endet mit dem
    // Abschluss. Hier bewusst abgewiesen statt still nichts zu tun.
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

    // ── 1. Vorgang anlegen ──────────────────────────────────────────
    const gemeinsam = {
      schritteDaten: fortschritt.schritteDaten,
      fehlendeAngaben: fortschritt.fehlendeAngaben,
      fortschrittId: fortschritt.id,
      organizationId,
    }

    // Beim Kundenablauf kommen Name und Telefon aus dem PROFIL, nicht aus
    // den Schritten: der Ablauf fragt sie nicht ab, weil die Person
    // angemeldet ist. Doppelt erfasst wichen sie irgendwann voneinander ab.
    const einreichung = typ === 'kunde'
      ? baueAnfrage({ ...gemeinsam, kontakt: await holeKontakt(admin, user.id, user.email ?? null) })
      : baueEinreichung(gemeinsam)

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
