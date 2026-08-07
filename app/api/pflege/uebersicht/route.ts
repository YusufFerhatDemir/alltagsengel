import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { getPflegeUebersicht, zusammenfassungUebersicht } from '@/lib/pflege/uebersicht'
import { getRisikoDashboard, zusammenfassungRisiken } from '@/lib/pflege/risiken'
import type { Aufnahmestatus, RisikoPruefstatus, RisikoSchweregrad } from '@/lib/pflege/types'

/**
 * GET — Pflegedoku-Übersicht (View pflege_uebersicht).
 * Mit ?risiken=true liefert die Route stattdessen das Risiko-Dashboard
 * (View pflege_risiko_dashboard) inklusive Kennzahlen.
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()

    if (params.get('risiken') === 'true') {
      const risiken = await getRisikoDashboard(admin, {
        organizationId,
        clientId: params.get('clientId') ?? undefined,
        schweregrad: (params.get('schweregrad') as RisikoSchweregrad) ?? undefined,
        pruefstatus: (params.get('pruefstatus') as RisikoPruefstatus) ?? undefined,
      })
      return NextResponse.json({ risiken, zusammenfassung: zusammenfassungRisiken(risiken) })
    }

    const uebersicht = await getPflegeUebersicht(admin, {
      organizationId,
      clientId: params.get('clientId') ?? undefined,
      aufnahmestatus: (params.get('aufnahmestatus') as Aufnahmestatus) ?? undefined,
      nurOhneAktivenPlan: params.get('nurOhneAktivenPlan') === 'true',
      nurOhneAnamnese: params.get('nurOhneAnamnese') === 'true',
    })

    return NextResponse.json({ uebersicht, zusammenfassung: zusammenfassungUebersicht(uebersicht) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
