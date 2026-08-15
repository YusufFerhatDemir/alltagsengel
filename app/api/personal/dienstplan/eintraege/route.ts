import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listEintraege, createEintrag } from '@/lib/personal/dienstplan'
import { pruefeEinsatzfreigabe } from '@/lib/personal/einsatzfreigabe'
import { writeAuditLog } from '@/lib/personal/audit'
import type { DienstplanStatus } from '@/lib/personal/types'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const datum = url.searchParams.get('datum')
  const datumVon = url.searchParams.get('datumVon')
  const datumBis = url.searchParams.get('datumBis')
  const caregiverId = url.searchParams.get('caregiverId')
  const clientId = url.searchParams.get('clientId')
  const status = url.searchParams.get('status')
  try {
    const data = await listEintraege(supabase, {
      organizationId: auth.ctx.organizationId,
      datum: datum || undefined,
      datumVon: datumVon || undefined,
      datumBis: datumBis || undefined,
      caregiverId: caregiverId || undefined,
      clientId: clientId || undefined,
      status: (status || undefined) as DienstplanStatus | undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
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

    const data = await createEintrag(supabase, {
      ...body,
      organizationId: auth.ctx.organizationId,
      erstelltVon: auth.ctx.userId,
    })

    // Audit-Trail bei forceOverride
    if (body.forceOverride && freigabeProbleme.length > 0) {
      await writeAuditLog(supabase, {
        organizationId: auth.ctx.organizationId,
        entitaetTyp: 'dienstplan',
        entitaetId: data.id,
        caregiverId: body.caregiverId,
        aktion: 'erstellt',
        nachher: { forceOverride: true, probleme: freigabeProbleme },
        grund: `forceOverride: ${freigabeProbleme.join('; ')}`,
        benutzerId: auth.ctx.userId,
      })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
