import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { erstelleSgbVKorrektur, fuehreSgbVKorrekturAus, type SgbVKorrekturTyp } from '@/lib/abrechnung/sgb-v/storno-korrektur'
import { withTracking } from '@/lib/monitoring/tracker'

const TYPEN: SgbVKorrekturTyp[] = ['storno', 'teilstorno', 'korrekturabrechnung']

/**
 * POST /api/billing/sgb-v/laeufe/[id]/storno
 * Body: { korrekturTyp: 'storno'|'teilstorno'|'korrekturabrechnung', grund: string }
 *
 * Legt den Korrekturvorgang an und führt ihn im selben Schritt aus (erzeugt
 * den Korrekturlauf) — die zweistufige API steht in storno-korrektur.ts
 * bereit, falls eine Freigabe zwischen Anlage und Ausführung nötig wird.
 */
export const POST = withTracking(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    // Ein Teilstorno ohne Betrag waere stillschweigend ein Vollstorno —
    // storno-korrektur.ts weist das ab, deshalb muss der Wert hier ankommen.
    if (body.differenzCent !== undefined && body.differenzCent !== null
        && typeof body.differenzCent !== 'number') {
      return NextResponse.json({ error: 'differenzCent muss eine Zahl sein.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { korrekturId } = await erstelleSgbVKorrektur(admin, {
      organizationId: auth.ctx.organizationId,
      originalLaufId: id,
      korrekturTyp: body.korrekturTyp,
      korrekturGrund: body.grund,
      differenzCent: body.differenzCent ?? undefined,
      actorId: auth.ctx.userId,
    })

    const { korrekturLaufId } = await fuehreSgbVKorrekturAus(admin, auth.ctx.organizationId, korrekturId, auth.ctx.userId)

    return NextResponse.json({ korrekturId, korrekturLaufId })
  } catch (err) {
    // apiErrorResponse statt err.message: der bisherige Zweig reichte JEDE
    // Fehlermeldung 1:1 an den Client — auch durchgereichte Postgres-Texte
    // mit Tabellen-, Spalten- und Constraint-Namen.
    return apiErrorResponse(err, request)
  }
})
