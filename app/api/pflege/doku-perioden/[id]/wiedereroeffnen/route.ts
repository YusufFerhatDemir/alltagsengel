import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { wiedereroeffnenPeriode } from '@/lib/pflege/doku-perioden'

/** POST { grund } — hebt den Monatsabschluss auf und entsperrt die Verlaufseinträge. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const body = await request.json().catch(() => ({}))
    if (!body.grund) {
      return NextResponse.json({ error: 'grund ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { periode, entsperrteEintraege } = await wiedereroeffnenPeriode(admin, id, auth.ctx.organizationId, {
      actorId: auth.ctx.userId,
      grund: body.grund,
    })

    return NextResponse.json({ periode, entsperrteEintraege })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
