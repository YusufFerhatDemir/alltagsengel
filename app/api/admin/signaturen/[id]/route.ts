import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireSigUser } from '@/lib/signaturen/api-auth'
import {
  leisteSignatur,
  lehneSignaturAb,
  verifiziereSignatur,
} from '@/lib/signaturen/signaturen'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSigUser()
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await req.json()

  try {
    const supabase = await createClient()

    if (body.action === 'signieren') {
      const signatur = await leisteSignatur(supabase, auth.organizationId, id, auth.userId, {
        methode: body.methode,
        signatur_daten: body.signatur_daten,
        ip_adresse: req.headers.get('x-forwarded-for') || undefined,
        user_agent: req.headers.get('user-agent') || undefined,
      })
      return NextResponse.json(signatur)
    }

    if (body.action === 'ablehnen') {
      const signatur = await lehneSignaturAb(
        supabase, auth.organizationId, id, auth.userId, body.grund,
      )
      return NextResponse.json(signatur)
    }

    if (body.action === 'verifizieren') {
      const ergebnis = await verifiziereSignatur(
        supabase, auth.organizationId, id, auth.userId,
      )
      return NextResponse.json(ergebnis)
    }

    return NextResponse.json({ error: 'Ungültige Aktion.' }, { status: 400 })
  } catch (err) {
    const msg = (err as Error).message
    const status = msg.includes('nicht gefunden') ? 404 : msg.includes('kann nicht') ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
