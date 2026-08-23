import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listRegeln, createRegel, setRegelAktiv, BONUS_KRITERIUM_TYP_WERTE } from '@/lib/analytics/bonusEngine'

export async function GET() {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response
  try {
    const supabase = await createClient()
    const regeln = await listRegeln(supabase, auth.ctx.organizationId)
    return NextResponse.json(regeln)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const { name, kriteriumTyp, schwellenwert, punkte } = body || {}
    if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name ist erforderlich.' }, { status: 400 })
    if (!BONUS_KRITERIUM_TYP_WERTE.includes(kriteriumTyp)) return NextResponse.json({ error: 'Unbekanntes Kriterium.' }, { status: 400 })
    const schwellenwertNum = Number(schwellenwert)
    const punkteNum = Number(punkte)
    if (!Number.isFinite(schwellenwertNum)) return NextResponse.json({ error: 'schwellenwert muss eine Zahl sein.' }, { status: 400 })
    if (!Number.isFinite(punkteNum) || punkteNum <= 0) return NextResponse.json({ error: 'punkte muss größer als 0 sein.' }, { status: 400 })

    const supabase = await createClient()
    const regel = await createRegel(supabase, {
      organizationId: auth.ctx.organizationId,
      name,
      kriteriumTyp,
      schwellenwert: schwellenwertNum,
      punkte: punkteNum,
      userId: auth.ctx.userId,
    })
    return NextResponse.json(regel, { status: 201 })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}

export async function PATCH(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const { id, aktiv } = body || {}
    if (!id || typeof aktiv !== 'boolean') return NextResponse.json({ error: 'id und aktiv sind erforderlich.' }, { status: 400 })
    const supabase = await createClient()
    const regel = await setRegelAktiv(supabase, { organizationId: auth.ctx.organizationId, id, aktiv })
    return NextResponse.json(regel)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
