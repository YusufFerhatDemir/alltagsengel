import { apiErrorResponse } from '@/lib/api/error-sanitizer'
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

    // Cross-Tenant-Schutz: schicht_id muss zur selben Organisation gehören
    // (createAdminClient umgeht RLS — dieser Check MUSS in der Route passieren).
    if (body.schichtId) {
      const { data: sch } = await supabase
        .from('dienstplan_schichten')
        .select('id')
        .eq('id', body.schichtId)
        .eq('organization_id', auth.ctx.organizationId)
        .maybeSingle()
      if (!sch) {
        return NextResponse.json({ error: 'Schicht gehört nicht zu dieser Organisation.' }, { status: 403 })
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

    // Vorher-Snapshot fuer den Audit-Trail (Best-Effort — blockiert PATCH nicht).
    const { data: vorher } = await supabase
      .from('dienstplan_eintraege')
      .select('datum, caregiver_id, client_id, start_zeit, end_zeit, status, typ, notizen')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    const data = await updateEintrag(supabase, id, auth.ctx.organizationId, body)

    // Audit-Trail: jede Aenderung wird protokolliert (nicht nur forceOverride).
    await writeAuditLog(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: 'dienstplan',
      entitaetId: id,
      caregiverId: body.caregiverId ?? vorher?.caregiver_id ?? null,
      aktion: 'bearbeitet',
      vorher: vorher ?? null,
      nachher: {
        datum: data.datum,
        caregiverId: data.caregiver_id,
        clientId: data.client_id,
        startZeit: data.start_zeit,
        endZeit: data.end_zeit,
        status: data.status,
        typ: data.typ,
        ...(body.forceOverride ? { forceOverride: true, probleme: freigabeProbleme } : {}),
      },
      grund: body.forceOverride && freigabeProbleme.length > 0
        ? `forceOverride: ${freigabeProbleme.join('; ')}`
        : null,
      benutzerId: auth.ctx.userId,
      benutzerRolle: auth.ctx.role,
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    // Vorher-Snapshot fuer den Audit-Trail (Best-Effort — blockiert DELETE nicht).
    const { data: vorher } = await supabase
      .from('dienstplan_eintraege')
      .select('datum, caregiver_id, client_id, start_zeit, end_zeit, status, typ, notizen')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    await deleteEintrag(supabase, id, auth.ctx.organizationId)

    await writeAuditLog(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: 'dienstplan',
      entitaetId: id,
      caregiverId: vorher?.caregiver_id ?? null,
      aktion: 'geloescht',
      vorher: vorher ?? null,
      benutzerId: auth.ctx.userId,
      benutzerRolle: auth.ctx.role,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
