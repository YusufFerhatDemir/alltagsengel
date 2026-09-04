/**
 * GET /api/admin/onboarding — Betriebssicht auf alle Onboarding-Abläufe
 *
 * Auswertung und Filter stecken in lib/onboarding/uebersicht.ts und sind
 * dort geprüft. Diese Route liest, bindet den Mandanten und reicht durch.
 *
 * ── DER MANDANT KOMMT AUS DER SITZUNG ──────────────────────────────────
 * organization_id wird ausdrücklich gefiltert, obwohl der org_fence in
 * der Datenbank dasselbe tut. Der Filter ist die Aussage, die Policy ist
 * die Sperre — und bei PostgREST ist ein leeres Ergebnis ohnehin
 * mehrdeutig (nichts da ODER durch RLS ausgeblendet).
 */

import { NextResponse } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { istOnboardingTyp } from '@/lib/onboarding/schritte'
import { werteAus, type UebersichtsZeile } from '@/lib/onboarding/uebersicht'
import { logger } from '@/lib/logger'

const log = logger.child('api:admin:onboarding')

const SPALTEN =
  'id, user_id, typ, aktueller_schritt, gesamt_schritte, schritte_daten, '
  + 'fehlende_angaben, dokument_status, letzte_auto_nachricht, abbruchstelle, '
  + 'abgeschlossen_am, created_at, updated_at, '
  + 'person:profiles(first_name, last_name, email)'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('stammdaten.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const typ = url.searchParams.get('typ')

    let abfrage = createAdminClient()
      .from('onboarding_progress')
      .select(SPALTEN)
      .eq('organization_id', auth.ctx.organizationId)
      .order('updated_at', { ascending: false })
      .limit(500)

    if (typ && istOnboardingTyp(typ)) abfrage = abfrage.eq('typ', typ)

    const { data, error } = await abfrage
    if (error) {
      log.errorWithException('Onboarding-Übersicht nicht lesbar', new Error(error.message))
      return NextResponse.json(
        { error: 'Die Übersicht konnte nicht geladen werden.' },
        { status: 500 },
      )
    }

    // Der eingebettete profiles-Join macht den Zeilentyp bei Supabase zu
    // einer Union mit GenericStringError; die Felder werden unten einzeln
    // und defensiv gelesen.
    const roh = (data ?? []) as unknown as Record<string, unknown>[]

    const zeilen = roh.map(z => {
      const person = z.person as { first_name?: string; last_name?: string; email?: string } | null
      const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim()

      const zeile: UebersichtsZeile = {
        id: String(z.id),
        userId: String(z.user_id),
        typ: z.typ as UebersichtsZeile['typ'],
        // Ohne Namen wird die Zeile NICHT ausgeblendet — sonst wartet
        // jemand, den niemand mehr sieht.
        name: name || person?.email || 'Ohne Namensangabe',
        aktuellerSchritt: Number(z.aktueller_schritt ?? 1),
        gesamtSchritte: Number(z.gesamt_schritte ?? 0),
        schritteDaten: (z.schritte_daten ?? {}) as UebersichtsZeile['schritteDaten'],
        fehlendeAngaben: (z.fehlende_angaben ?? []) as string[],
        dokumentStatus: (z.dokument_status ?? {}) as Record<string, unknown>,
        letzteAutoNachricht: (z.letzte_auto_nachricht as string | null) ?? null,
        abbruchstelle: (z.abbruchstelle as string | null) ?? null,
        abgeschlossenAm: (z.abgeschlossen_am as string | null) ?? null,
        createdAt: String(z.created_at ?? ''),
        updatedAt: String(z.updated_at ?? ''),
      }
      return werteAus(zeile)
    })

    return NextResponse.json({ zeilen })
  } catch (err) {
    log.errorWithException('Onboarding-Übersicht fehlgeschlagen', err)
    return NextResponse.json(
      { error: 'Die Übersicht konnte nicht geladen werden.' },
      { status: 500 },
    )
  }
})
