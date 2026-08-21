import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { importiereSgbVRuecklaeufer, ladeSgbVRuecklaeufer } from '@/lib/abrechnung/sgb-v/ruecklaufer-service'
import type { RuecklaeuferTyp } from '@/lib/abrechnung/ruecklaeufer'
import { logger } from '@/lib/logger'
const log = logger.child('billing/sgb-v/ruecklaeufer')

const TYPEN: RuecklaeuferTyp[] = ['quittung', 'annahmebestaetigung', 'fehlermeldung', 'abrechnungsergebnis', 'zahlungsavis', 'sonstige']

/** GET /api/billing/sgb-v/ruecklaeufer?laufId=... */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const laufId = url.searchParams.get('laufId') ?? undefined
    const admin = createAdminClient()
    const ruecklaeufer = await ladeSgbVRuecklaeufer(admin, auth.ctx.organizationId, laufId)
    return NextResponse.json({ ruecklaeufer })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST /api/billing/sgb-v/ruecklaeufer — Rückmeldung einer Kasse importieren.
 * Body: { sgbVLaufId, ruecklaeuferTyp, originalMeldung, ... }
 */
export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    if (!body.sgbVLaufId) return NextResponse.json({ error: 'sgbVLaufId ist Pflicht.' }, { status: 400 })
    if (!TYPEN.includes(body.ruecklaeuferTyp)) {
      return NextResponse.json({ error: `ruecklaeuferTyp muss einer von ${TYPEN.join(', ')} sein.` }, { status: 400 })
    }
    if (!body.originalMeldung?.trim()) {
      return NextResponse.json({ error: 'originalMeldung ist Pflicht — die Rückmeldung wird immer unverändert gespeichert.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ergebnis = await importiereSgbVRuecklaeufer(admin, {
      organizationId: auth.ctx.organizationId,
      sgbVLaufId: body.sgbVLaufId,
      kostentraegerIk: body.kostentraegerIk ?? undefined,
      ruecklaeuferTyp: body.ruecklaeuferTyp,
      originalMeldung: body.originalMeldung,
      quelldateiName: body.quelldateiName ?? undefined,
      betragAngefordertCent: body.betragAngefordertCent ?? undefined,
      betragAnerkannt_cent: body.betragAnerkanntCent ?? undefined,
      fehlerCode: body.fehlerCode ?? undefined,
      fehlerText: body.fehlerText ?? undefined,
      actorId: auth.ctx.userId,
    })

    return NextResponse.json(ergebnis, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    log.error('Fehler', { message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
