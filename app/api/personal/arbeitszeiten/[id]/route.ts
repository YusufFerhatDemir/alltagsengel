import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateArbeitszeit } from '@/lib/personal/arbeitszeiten'
import { writeAuditLog } from '@/lib/personal/audit'
import { withTracking } from '@/lib/monitoring/tracker'

export const PATCH = withTracking(async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin('personal.schreiben')
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

    // Der Akteur kommt aus dem Auth-Kontext und wird NACH dem Body gesetzt —
    // ein mitgeschicktes `benutzerId` aus dem Request wird damit ueberschrieben.
    // Ohne ihn kann der Trigger das Korrekturprotokoll nicht schreiben, weil
    // der Dienstschluessel kein auth.uid() hat (siehe
    // lib/personal/arbeitszeiten.ts, AkteurParams).
    //
    // Bewusst kein Objekt-Literal mit Body-Spread: die Organisation steht hier
    // als eigenes Argument und ist aus dem Body ohnehin nicht erreichbar. Ein
    // Spread wuerde nur die Pruefung aus
    // __tests__/security/p0-personal-mandanten-isolation.test.ts ausloesen,
    // die genau solche Literale sucht — ohne dass es hier etwas abzusichern gaebe.
    body.benutzerId = auth.ctx.userId
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
})
