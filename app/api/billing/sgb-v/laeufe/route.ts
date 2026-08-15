import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listeAbrechnungslaeufe, starteAbrechnungslauf } from '@/lib/abrechnung/sgb-v/abrechnungslauf'

/** GET /api/billing/sgb-v/laeufe — Liste der § 302-Abrechnungsläufe. */
export async function GET() {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const laeufe = await listeAbrechnungslaeufe(admin, auth.ctx.organizationId)
    return NextResponse.json({ laeufe })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/laeufe] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
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
    console.error('[billing/sgb-v/laeufe] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
