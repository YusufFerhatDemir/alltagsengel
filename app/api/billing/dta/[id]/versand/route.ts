import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { versendeLauf } from '@/lib/abrechnung/versand'
import { withTracking } from '@/lib/monitoring/tracker'

// SFTP (ssh2) läuft nicht in der Edge-Runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/dta/[id]/versand
 * Body (optional): { "testmodus": true }
 *
 * Überträgt alle versandbereiten DAKOTA-Aufträge eines Laufs an ihre
 * Datenannahmestellen.
 *
 * Antwortcodes:
 *   200 — Pipeline gelaufen (auch wenn sie an einer Sperre angehalten hat;
 *         das Ergebnis sagt, wo und warum)
 *   409 — nichts zu versenden / Doppelversand verweigert
 *
 * Eine geschlossene externe Freigabe ist KEIN Fehler: sie ist der erwartete
 * Zustand und kommt als 200 mit `gestoppt: "extern"` zurück, damit die
 * Oberfläche sie erklären kann statt einen Absturz zu zeigen.
 */
export const POST = withTracking(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const { organizationId, userId } = auth

    let testmodus = false
    try {
      const body = await request.json()
      testmodus = body?.testmodus === true
    } catch {
      // Kein Body = Echtversand. Bewusst kein Default auf Testmodus:
      // ein stiller Testlauf, den jemand für einen Versand hält, ist die
      // teurere Verwechslung (Frist verstreicht, Kasse bekommt nichts).
    }

    const admin = createAdminClient()
    const ergebnis = await versendeLauf(admin, id, organizationId, userId, testmodus)

    return NextResponse.json({
      ...ergebnis,
      testmodus,
      hinweis: testmodus
        ? 'Testmodus: Dateien wurden erzeugt und geprüft, aber NICHT übertragen. Der Auftragsstatus ist unverändert.'
        : null,
    })
  } catch (err) {
    const message = (err as Error).message
    // Doppelversand und "nichts versandbereit" sind Zustandskonflikte, keine
    // Serverfehler — 409 lässt die Oberfläche sinnvoll reagieren.
    const konflikt = message.includes('bereits im Status')
      || message.includes('Keine versandbereiten')
      || message.includes('kann nicht versendet werden')
    return NextResponse.json({ error: message }, { status: konflikt ? 409 : 500 })
  }
})
