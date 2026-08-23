import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { erstelleSgbVKorrektur, fuehreSgbVKorrekturAus, type SgbVKorrekturTyp } from '@/lib/abrechnung/sgb-v/storno-korrektur'
import { logger } from '@/lib/logger'
const log = logger.child('billing/sgb-v/laeufe/[id]')

const TYPEN: SgbVKorrekturTyp[] = ['storno', 'teilstorno', 'korrekturabrechnung']

/**
 * POST /api/billing/sgb-v/laeufe/[id]/storno
 * Body: { korrekturTyp: 'storno'|'teilstorno'|'korrekturabrechnung', grund: string }
 *
 * Legt den Korrekturvorgang an und führt ihn im selben Schritt aus (erzeugt
 * den Korrekturlauf) — die zweistufige API steht in storno-korrektur.ts
 * bereit, falls eine Freigabe zwischen Anlage und Ausführung nötig wird.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json()
    if (!TYPEN.includes(body.korrekturTyp)) {
      return NextResponse.json({ error: `korrekturTyp muss einer von ${TYPEN.join(', ')} sein.` }, { status: 400 })
    }
    if (!body.grund?.trim()) {
      return NextResponse.json({ error: 'grund ist Pflicht.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { korrekturId } = await erstelleSgbVKorrektur(admin, {
      organizationId: auth.ctx.organizationId,
      originalLaufId: id,
      korrekturTyp: body.korrekturTyp,
      korrekturGrund: body.grund,
      actorId: auth.ctx.userId,
    })

    const { korrekturLaufId } = await fuehreSgbVKorrekturAus(admin, auth.ctx.organizationId, korrekturId, auth.ctx.userId)

    return NextResponse.json({ korrekturId, korrekturLaufId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    log.error('/storno] Fehler', { message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
