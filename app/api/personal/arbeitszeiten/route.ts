import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin, requirePersonalUser } from '@/lib/personal/api-auth'
import { createArbeitszeit, listArbeitszeiten } from '@/lib/personal/arbeitszeiten'
import { getActiveOrgId } from '@/lib/organizations/server'
import type { ArbeitszeitStatus } from '@/lib/personal/types'
import { writeAuditLog } from '@/lib/personal/audit'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const admin = await requirePersonalAdmin('personal.lesen')
    if (admin.ok) {
      const supabase = createAdminClient()
      const sp = req.nextUrl.searchParams
      const data = await listArbeitszeiten(supabase, {
        organizationId: admin.ctx.organizationId,
        caregiverId: sp.get('caregiverId') ?? undefined,
        datumVon: sp.get('datumVon') ?? undefined,
        datumBis: sp.get('datumBis') ?? undefined,
        status: (sp.get('status') ?? undefined) as ArbeitszeitStatus | undefined,
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
    // Fail-closed (Audit MITTEL-1): ohne Org-Mitgliedschaft keine Zeitdaten.
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    const sp = req.nextUrl.searchParams
    const data = await listArbeitszeiten(supabase, {
      organizationId: orgId,
      caregiverId: user.caregiverId,
      datumVon: sp.get('datumVon') ?? undefined,
      datumBis: sp.get('datumBis') ?? undefined,
      status: (sp.get('status') ?? undefined) as ArbeitszeitStatus | undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  try {
    const admin = await requirePersonalAdmin('personal.schreiben')
    if (admin.ok) {
      const supabase = createAdminClient()
      const body = await req.json()
      const data = await createArbeitszeit(supabase, {
        ...body,
        organizationId: admin.ctx.organizationId,
        // NACH dem Spread: der handelnde Benutzer kommt aus dem
        // Auth-Kontext, niemals aus dem Body. Er landet in
        // `geaendert_von` und ist die Quelle des Korrekturprotokolls
        // (der Dienstschluessel hat kein auth.uid()).
        benutzerId: admin.ctx.userId,
      })
      await writeAuditLog(supabase, {
        organizationId: admin.ctx.organizationId,
        entitaetTyp: 'arbeitszeit',
        entitaetId: data.id,
        caregiverId: data.caregiver_id,
        aktion: 'erstellt',
        nachher: { datum: data.datum, start_zeit: data.start_zeit, end_zeit: data.end_zeit, ist_minuten: data.ist_minuten, quelle: data.quelle },
        benutzerId: admin.ctx.userId,
        benutzerRolle: admin.ctx.role,
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
    // Fail-closed (Audit MITTEL-1): ohne Org-Mitgliedschaft kein Schreibrecht.
    if (!orgId) return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    const body = await req.json()
    const data = await createArbeitszeit(supabase, {
      ...body,
      organizationId: orgId,
      caregiverId: user.caregiverId,
      benutzerId: user.userId,
    })
    await writeAuditLog(supabase, {
      organizationId: orgId,
      entitaetTyp: 'arbeitszeit',
      entitaetId: data.id,
      caregiverId: data.caregiver_id,
      aktion: 'erstellt',
      nachher: { datum: data.datum, start_zeit: data.start_zeit, end_zeit: data.end_zeit, ist_minuten: data.ist_minuten, quelle: data.quelle },
      benutzerId: user.userId,
      benutzerRolle: user.role,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})
