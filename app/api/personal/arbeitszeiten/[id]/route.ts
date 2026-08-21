import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateArbeitszeit } from '@/lib/personal/arbeitszeiten'
import { writeAuditLog } from '@/lib/personal/audit'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { id } = await params
    const body = await req.json()

    // Alten Stand für den Audit-Trail merken (wichtig als Abrechnungsnachweis
    // bei nachträglichen Korrekturen von Start-/Endzeit).
    const { data: vorher } = await supabase
      .from('personal_arbeitszeiten')
      .select('caregiver_id, start_zeit, end_zeit, pause_minuten, ist_minuten, status, gesperrt')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    const data = await updateArbeitszeit(supabase, id, auth.ctx.organizationId, body)

    const aktion = body.gesperrt === true ? 'gesperrt'
      : body.status === 'bestaetigt' ? 'genehmigt'
      : 'korrigiert'
    await writeAuditLog(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: 'arbeitszeit',
      entitaetId: id,
      caregiverId: data.caregiver_id,
      aktion,
      vorher: vorher ?? null,
      nachher: { start_zeit: data.start_zeit, end_zeit: data.end_zeit, pause_minuten: data.pause_minuten, ist_minuten: data.ist_minuten, status: data.status, gesperrt: data.gesperrt },
      grund: body.bemerkung ?? null,
      benutzerId: auth.ctx.userId,
      benutzerRolle: auth.ctx.role,
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
