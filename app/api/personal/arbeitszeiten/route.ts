import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin, requirePersonalUser } from '@/lib/personal/api-auth'
import { createArbeitszeit, listArbeitszeiten } from '@/lib/personal/arbeitszeiten'
import { getActiveOrgId } from '@/lib/organizations/server'

export async function GET(req: NextRequest) {
  try {
    const admin = await requirePersonalAdmin()
    if (admin.ok) {
      const supabase = createAdminClient()
      const sp = req.nextUrl.searchParams
      const data = await listArbeitszeiten(supabase, {
        organizationId: admin.ctx.organizationId,
        caregiverId: sp.get('caregiverId') ?? undefined,
        datumVon: sp.get('datumVon') ?? undefined,
        datumBis: sp.get('datumBis') ?? undefined,
        status: (sp.get('status') ?? undefined) as any,
        nurGesperrt: sp.get('nurGesperrt') === 'true' ? true : undefined,
      })
      return NextResponse.json(data)
    }

    const user = await requirePersonalUser()
    if (!user.ok) return user.response
    if (!user.caregiverId) {
      return NextResponse.json({ error: 'Kein Mitarbeiterprofil vorhanden.' }, { status: 403 })
    }
    const supabase = createAdminClient()
    const orgId = await getActiveOrgId()
    const sp = req.nextUrl.searchParams
    const data = await listArbeitszeiten(supabase, {
      organizationId: orgId,
      caregiverId: user.caregiverId,
      datumVon: sp.get('datumVon') ?? undefined,
      datumBis: sp.get('datumBis') ?? undefined,
      status: (sp.get('status') ?? undefined) as any,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePersonalAdmin()
    if (admin.ok) {
      const supabase = createAdminClient()
      const body = await req.json()
      const data = await createArbeitszeit(supabase, {
        ...body,
        organizationId: admin.ctx.organizationId,
      })
      return NextResponse.json(data, { status: 201 })
    }

    const user = await requirePersonalUser()
    if (!user.ok) return user.response
    if (!user.caregiverId) {
      return NextResponse.json({ error: 'Kein Mitarbeiterprofil vorhanden.' }, { status: 403 })
    }
    const supabase = createAdminClient()
    const orgId = await getActiveOrgId()
    const body = await req.json()
    const data = await createArbeitszeit(supabase, {
      ...body,
      organizationId: orgId,
      caregiverId: user.caregiverId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
