import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listeAbrechnungslaeufe, starteAbrechnungslauf } from '@/lib/abrechnung/sgb-v/abrechnungslauf'
import { logger } from '@/lib/logger'
const log = logger.child('billing/sgb-v/laeufe')

/** GET /api/billing/sgb-v/laeufe — Liste der § 302-Abrechnungsläufe. */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const laeufe = await listeAbrechnungslaeufe(admin, auth.ctx.organizationId)
    return NextResponse.json({ laeufe })
  } catch (err) {
    return safeApiError(err, request)
  }
}

/**
 * POST /api/billing/sgb-v/laeufe — Abrechnungslauf starten.
 * Body: { abrechnungsmonat: 'JJJJ-MM', kostentraegerIk?, bundesland? }
 *
 * Legt IMMER einen Lauf an, auch wenn die Kette danach am Generator/Gate
 * stoppt — siehe lib/abrechnung/sgb-v/versand.ts für die Begründung.
 */
export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    if (!body.abrechnungsmonat || !/^\d{4}-\d{2}$/.test(body.abrechnungsmonat)) {
      return NextResponse.json({ error: 'abrechnungsmonat muss JJJJ-MM sein.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ergebnis = await starteAbrechnungslauf(admin, {
      organizationId: auth.ctx.organizationId,
      abrechnungsmonat: body.abrechnungsmonat,
      bundesland: body.bundesland ?? null,
      kostentraegerIk: body.kostentraegerIk ?? null,
      actorId: auth.ctx.userId,
    })

    return NextResponse.json(ergebnis, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    log.error('Fehler', { message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
