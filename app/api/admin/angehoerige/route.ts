import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAngehAdmin } from '@/lib/angehoerige/api-auth'
import { listeZugaenge, erstelleZugang, protokolliereZugriff } from '@/lib/angehoerige/angehoerige'

export async function GET(req: NextRequest) {
  const auth = await requireAngehAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const client_id = url.searchParams.get('client_id') || undefined
  const status = url.searchParams.get('status') || undefined
  const rolle = url.searchParams.get('rolle') || undefined

  try {
    const supabase = await createClient()
    const zugaenge = await listeZugaenge(supabase, auth.ctx.organizationId, {
      client_id,
      status: status as any,
      rolle: rolle as any,
    })
    return NextResponse.json(zugaenge)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAngehAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const supabase = await createClient()

    // Mandantenschutz: der Klient muss zur aktiven Organisation gehören.
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', body.client_id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }

    const zugang = await erstelleZugang(supabase, auth.ctx.organizationId, auth.ctx.userId, body)

    await protokolliereZugriff(supabase, auth.ctx.organizationId, {
      zugang_id: zugang.id,
      user_id: auth.ctx.userId,
      client_id: zugang.client_id,
      aktion: 'zugang_erteilt',
      details: { rolle: zugang.rolle, bereiche: zugang.freigegebene_bereiche },
    })

    return NextResponse.json(zugang, { status: 201 })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('Pflichtfeld') || msg.includes('muss') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
