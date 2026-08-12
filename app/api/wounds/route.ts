import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { createWound, listWounds, zusammenfassungWunden } from '@/lib/wunden/wunden'
import type { WundStatus, WundTyp } from '@/lib/wunden/types'

export async function GET(request: Request) {
  try {
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const wunden = await listWounds(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      wundTyp: (params.get('wundTyp') as WundTyp) ?? undefined,
      status: (params.get('status') as WundStatus) ?? undefined,
      nurOffene: params.get('nurOffene') === 'true',
    })

    return NextResponse.json({ wunden, zusammenfassung: zusammenfassungWunden(wunden) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const body = await request.json()
    if (!body.clientId || !body.wundTyp || !body.lokalisation) {
      return NextResponse.json({ error: 'clientId, wundTyp und lokalisation sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('id', body.clientId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    const wunde = await createWound(admin, {
      organizationId,
      clientId: body.clientId,
      wundTyp: body.wundTyp,
      dekubitusGrad: body.dekubitusGrad ?? null,
      lokalisation: body.lokalisation,
      koerperstelleCode: body.koerperstelleCode ?? null,
      koerperseite: body.koerperseite ?? null,
      entstandenAm: body.entstandenAm ?? null,
      bemerkung: body.bemerkung ?? null,
      erstelltVon: userId,
    })

    return NextResponse.json({ wunde })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
