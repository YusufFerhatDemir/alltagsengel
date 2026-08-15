import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { updateEintrag, deleteEintrag } from '@/lib/personal/dienstplan'
import { pruefeEinsatzfreigabe } from '@/lib/personal/einsatzfreigabe'
import { writeAuditLog } from '@/lib/personal/audit'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()

    // Cross-Tenant-Schutz: client_id muss zur selben Organisation gehören
    if (body.clientId) {
      const { data: cl } = await supabase
        .from('clients')
        .select('id')
        .eq('id', body.clientId)
        .eq('organization_id', auth.ctx.organizationId)
        .maybeSingle()
      if (!cl) {
        return NextResponse.json({ error: 'Klient gehört nicht zu dieser Organisation.' }, { status: 403 })
      }
    }

    let freigabeProbleme: string[] = []
    if (body.caregiverId) {
      const freigabe = await pruefeEinsatzfreigabe(supabase, body.caregiverId, auth.ctx.organizationId)
      if (!freigabe.freigegeben && !body.forceOverride) {
        return NextResponse.json({
          error: `Mitarbeiter "${freigabe.caregiverName}" ist nicht für Einsätze freigegeben.`,
          freigabe_probleme: freigabe.probleme,
          abgelaufene_qualifikationen: freigabe.abgelaufeneQualifikationen,
          hinweis: 'Mit forceOverride: true kann die Zuweisung erzwungen werden.',
        }, { status: 422 })
      }
      if (!freigabe.freigegeben) freigabeProbleme = freigabe.probleme
    }

    const data = await updateEintrag(supabase, id, auth.ctx.organizationId, body)

    if (body.forceOverride && freigabeProbleme.length > 0) {
      await writeAuditLog(supabase, {
        organizationId: auth.ctx.organizationId,
        entitaetTyp: 'dienstplan',
        entitaetId: id,
        caregiverId: body.caregiverId,
        aktion: 'bearbeitet',
        nachher: { forceOverride: true, probleme: freigabeProbleme },
        grund: `forceOverride: ${freigabeProbleme.join('; ')}`,
        benutzerId: auth.ctx.userId,
      })
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    await deleteEintrag(supabase, id, auth.ctx.organizationId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
