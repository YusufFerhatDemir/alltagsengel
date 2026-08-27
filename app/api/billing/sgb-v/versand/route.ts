import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { erzeugeUndVersendeSgbV, sgbVKanalStatus } from '@/lib/abrechnung/sgb-v/versand'
import { monatBerlin } from '@/lib/utils/timezone'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET  /api/billing/sgb-v/versand           → Kanalstatus (warum ist zu?)
 * POST /api/billing/sgb-v/versand
 *   Body: { monat?: "2026-08", kostentraeger_ik?, bundesland?, dateiindikator?: "0"|"2" }
 *
 * Legt einen § 302-Lauf an und versucht Erzeugung + Versand.
 *
 * Solange die Technische Anlage 1 fehlt, endet der Versuch planmässig im
 * Status 'gesperrt_extern' — mit angelegtem Lauf, gezählten Fällen und
 * Klartext-Begründung. Das ist kein Fehler, sondern der Nachweis, dass der
 * Versuch stattgefunden hat und woran er hängt.
 */
export const GET = withTracking(async function GET() {
  const auth = await requireAdminMitOrg('abrechnung.lesen')
  if (!auth.ok) return auth.response
  return NextResponse.json(sgbVKanalStatus())
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      // Kein Body: laufender Monat, Sammellauf, Testindikator.
    }

    const monat = typeof body.monat === 'string' ? body.monat : monatBerlin()
    if (!/^\d{4}-\d{2}$/.test(monat)) {
      return NextResponse.json({ error: 'monat muss JJJJ-MM sein.' }, { status: 400 })
    }

    const dateiindikator = body.dateiindikator === '2' ? '2' : '0'

    const admin = createAdminClient()
    const ergebnis = await erzeugeUndVersendeSgbV(admin, {
      organizationId: auth.organizationId,
      abrechnungsmonat: monat,
      bundesland: typeof body.bundesland === 'string' ? body.bundesland : null,
      kostentraegerIk: typeof body.kostentraeger_ik === 'string' ? body.kostentraeger_ik : null,
      dateiindikator,
      actorId: auth.userId,
    })

    return NextResponse.json({ ...ergebnis, kanal: sgbVKanalStatus() })
  } catch (err) {
    const message = (err as Error).message
    return NextResponse.json(
      { error: message },
      { status: message.includes('existiert bereits') ? 409 : 500 },
    )
  }
})
