import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  erfasseHkpLeistung, listeHkpLeistungsnachweise, pruefeVollstaendigkeit,
} from '@/lib/abrechnung/sgb-v/leistungsnachweis-service'
import { safeApiError } from '@/lib/api/error-sanitizer'

/**
 * GET /api/billing/sgb-v/leistungsnachweise?von=...&bis=...&verordnungId=...&pruefen=1
 * `pruefen=1` liefert zusätzlich die Vollständigkeitsprüfung für den Zeitraum.
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const von = url.searchParams.get('von') ?? undefined
    const bis = url.searchParams.get('bis') ?? undefined
    const verordnungId = url.searchParams.get('verordnungId') ?? undefined

    const admin = createAdminClient()
    const leistungsnachweise = await listeHkpLeistungsnachweise(admin, auth.ctx.organizationId, { von, bis, verordnungId })

    let vollstaendigkeit: Awaited<ReturnType<typeof pruefeVollstaendigkeit>> | null = null
    if (url.searchParams.get('pruefen') === '1' && von && bis) {
      vollstaendigkeit = await pruefeVollstaendigkeit(admin, auth.ctx.organizationId, von, bis)
    }

    return NextResponse.json({ leistungsnachweise, vollstaendigkeit })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/** POST /api/billing/sgb-v/leistungsnachweise — Leistung erfassen. */
export async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    for (const feld of ['clientId', 'verordnungId', 'caregiverId', 'date', 'startTime', 'endTime', 'leistungsart', 'amount']) {
      if (body[feld] === undefined || body[feld] === null || body[feld] === '') {
        return NextResponse.json({ error: `Feld "${feld}" ist Pflicht.` }, { status: 400 })
      }
    }

    const admin = createAdminClient()
    const id = await erfasseHkpLeistung(admin, auth.ctx.organizationId, {
      clientId: body.clientId,
      verordnungId: body.verordnungId,
      caregiverId: body.caregiverId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      durationMinutes: body.durationMinutes ?? null,
      leistungsart: body.leistungsart,
      amount: Number(body.amount),
      notes: body.notes ?? null,
    }, auth.ctx.userId)

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
}
