/**
 * GET /api/cron/onboarding-erinnerung — täglicher Erinnerungslauf
 *
 * Stößt Menschen an, die einen Onboarding-Ablauf begonnen und nicht
 * beendet haben. Zwei Stufen (nach 1 und nach 3 Tagen ohne Aktivität),
 * danach nie wieder — der Plan steht in lib/onboarding/triggers.ts, die
 * Entscheidung in lib/onboarding/erinnerungen.ts, und beides ist dort
 * getestet. Diese Route ist nur der Auslöser.
 *
 * ── DAS TOR ────────────────────────────────────────────────────────────
 * pruefeCronGeheimnis() ist die EINZIGE zulässige Prüfung. Ein selbst
 * gebautes `Bearer ${CRON_SECRET}` ist bei fehlender Variable
 * „Bearer undefined" — und das passt dann auf jeden Aufrufer.
 *
 * ── TROCKENLAUF ────────────────────────────────────────────────────────
 * `?trockenlauf=1` plant nur und versendet nichts. Damit lässt sich vor
 * der Scharfschaltung sehen, WEN der Lauf anschreiben würde — bei einer
 * Automatik, die echte Menschen anschreibt, ist das kein Luxus.
 */

import { NextResponse } from 'next/server'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { fuehreErinnerungslaufAus, type LaufErgebnis } from '@/lib/onboarding/erinnerungen'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'

const log = logger.child('cron:onboarding-erinnerung')

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Basis-URL für den Fortsetzen-Link.
 *
 * Fail-closed: ohne verlässliche URL wird NICHT versendet. Eine Mail mit
 * kaputtem Link ist schlimmer als keine — sie verbraucht die eine Stufe,
 * die dieser Person zusteht, und führt ins Leere.
 *
 * BEWUSST OHNE VERCEL_URL-Rückfall: die Variable trägt bei Preview-
 * Deployments die Preview-Domain. Ein Erinnerungslink dorthin ginge an
 * echte Menschen und führte auf einen Stand, der morgen weg ist.
 * Ausschließlich NEXT_PUBLIC_SITE_URL — oder gar nichts.
 */
function basisUrl(): string | null {
  const roh = process.env.NEXT_PUBLIC_SITE_URL
  if (!roh) return null
  try {
    const url = new URL(roh)
    return url.protocol === 'https:' || url.hostname === 'localhost' ? url.origin : null
  } catch {
    return null
  }
}

export const GET = withTracking(async function GET(request: Request) {
  const abgewiesen = pruefeCronGeheimnis(request)
  if (abgewiesen) return abgewiesen

  const trockenlauf = new URL(request.url).searchParams.get('trockenlauf') === '1'

  const url = basisUrl()
  if (!url) {
    log.error('NEXT_PUBLIC_SITE_URL fehlt — Erinnerungslauf sendet nicht')
    return NextResponse.json(
      { error: 'Basis-URL nicht konfiguriert — es wurde nichts versendet.' },
      { status: 503 },
    )
  }

  try {
    const admin = createAdminClient()

    // Alle Mandanten. Der Lauf ist je Organisation abgegrenzt; ein
    // Fehlschlag bei einem darf die anderen nicht mitreißen.
    const { data: organisationen, error } = await admin.from('organizations').select('id')
    if (error) {
      log.errorWithException('Mandanten nicht lesbar', new Error(error.message))
      return NextResponse.json({ error: 'Lauf nicht möglich.' }, { status: 500 })
    }

    const ergebnisse: LaufErgebnis[] = []
    for (const organisation of organisationen ?? [{ id: DEFAULT_ORG_ID }]) {
      try {
        ergebnisse.push(await fuehreErinnerungslaufAus(admin, {
          organizationId: String(organisation.id),
          basisUrl: url,
          trockenlauf,
        }))
      } catch (err) {
        log.errorWithException('Erinnerungslauf fehlgeschlagen', err, {
          organizationId: String(organisation.id),
        })
      }
    }

    const summe = ergebnisse.reduce((s, e) => ({
      betrachtet: s.betrachtet + e.betrachtet,
      versendet: s.versendet + e.versendet,
      uebersprungen: s.uebersprungen + e.uebersprungen,
      fehlgeschlagen: s.fehlgeschlagen + e.fehlgeschlagen,
    }), { betrachtet: 0, versendet: 0, uebersprungen: 0, fehlgeschlagen: 0 })

    log.info('Erinnerungslauf beendet', { ...summe, trockenlauf, mandanten: ergebnisse.length })

    return NextResponse.json({ ok: true, trockenlauf, ...summe, mandanten: ergebnisse.length })
  } catch (err) {
    log.errorWithException('Erinnerungslauf abgebrochen', err)
    return NextResponse.json({ error: 'Lauf abgebrochen.' }, { status: 500 })
  }
})
