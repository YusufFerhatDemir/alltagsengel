/**
 * /api/billing/dta/fristen
 *
 * GET:  Überfällige Fristen + anstehende Wiedervorlagen
 * POST: Fristenprüfung manuell auslösen (Eskalation + Abgelaufen-Markierung)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  pruefeUeberfaelligeFristen,
  escaliereUeberfaellige,
} from '@/lib/abrechnung/fristen-manager'

export async function GET() {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const uebersicht = await pruefeUeberfaelligeFristen(admin, organizationId)

    return NextResponse.json(uebersicht)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const auth = await requireOpsAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const admin = createAdminClient()
    const ergebnis = await escaliereUeberfaellige(admin, organizationId, userId)

    return NextResponse.json({
      ...ergebnis,
      nachricht: `${ergebnis.eskaliert} Fristen eskaliert, ${ergebnis.abgelaufen} als abgelaufen markiert.`,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
