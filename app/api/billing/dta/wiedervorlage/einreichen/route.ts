import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { reicheKorrigierteEin } from '@/lib/abrechnung/wiedervorlage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/dta/wiedervorlage/einreichen
 * Body: { "original_lauf_id": "…", "korrektur_grund": "…" }
 *
 * Erzeugt aus allen korrigierten Queue-Einträgen eines Laufs einen
 * Korrekturlauf und markiert sie als eingereicht.
 *
 * Nur Einträge im Status 'korrigiert' kommen mit — eine unveränderte
 * Wiedereinreichung wird von der Kasse identisch abgelehnt und kostet nur die
 * Frist.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const originalLaufId = body?.original_lauf_id
    if (!originalLaufId || typeof originalLaufId !== 'string') {
      return NextResponse.json({ error: 'original_lauf_id ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ergebnis = await reicheKorrigierteEin(admin, {
      organizationId: auth.organizationId,
      originalLaufId,
      actorId: auth.userId,
      korrekturGrund: typeof body?.korrektur_grund === 'string' ? body.korrektur_grund : undefined,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    const message = (err as Error).message
    return NextResponse.json(
      { error: message },
      { status: message.includes('Keine korrigierten') ? 409 : 500 },
    )
  }
}
