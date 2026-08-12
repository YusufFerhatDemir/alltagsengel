import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { pruefeEinsatzfreigabe, pruefeClientFreigabe, pruefeBudget } from '@/lib/personal/einsatzfreigabe'

async function requireStaff(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id, role: profile.role }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  const caregiverId = searchParams.get('caregiver_id') || null
  const clientId = searchParams.get('client_id') || null
  const bundesland = searchParams.get('bundesland') || null
  const status = searchParams.get('status') || null

  if (!start || !end) {
    return NextResponse.json({ error: 'start und end Parameter erforderlich' }, { status: 400 })
  }

  const admin = createAdminClient()
  let query = admin
    .from('assignments')
    .select(`
      id, assignment_date, weekday, start_time, end_time, status,
      service_type, recurrence_rule, bundesland,
      client:clients!inner(id, first_name, last_name),
      caregiver:caregivers!inner(id, first_name, last_name)
    `)
    .eq('organization_id', organizationId)
    .gte('assignment_date', start)
    .lte('assignment_date', end)

  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  if (clientId) query = query.eq('client_id', clientId)
  if (bundesland) query = query.eq('bundesland', bundesland)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('assignment_date').order('start_time')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const {
    client_id, caregiver_id, assignment_date, weekday,
    start_time, end_time, service_type, is_recurring,
    valid_from, valid_until, address, zip_code,
    recurrence_rule, recurrence_end, notes, status: assignmentStatus,
  } = body

  if (!client_id || !caregiver_id || !start_time || !end_time || !service_type) {
    return NextResponse.json({ error: 'Pflichtfelder: client_id, caregiver_id, start_time, end_time, service_type' }, { status: 400 })
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const admin = createAdminClient()

  const clientCheck = await pruefeClientFreigabe(admin, client_id, organizationId, assignment_date)
  if (!clientCheck.freigegeben && !body.force_override) {
    return NextResponse.json({
      error: `Klient "${clientCheck.clientName}" ist nicht für Einsätze freigegeben.`,
      client_probleme: clientCheck.probleme,
      hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
    }, { status: 422 })
  }

  const freigabe = await pruefeEinsatzfreigabe(admin, caregiver_id, organizationId)
  if (!freigabe.freigegeben && !body.force_override) {
    return NextResponse.json({
      error: `Mitarbeiter "${freigabe.caregiverName}" ist nicht für Einsätze freigegeben.`,
      freigabe_probleme: freigabe.probleme,
      abgelaufene_qualifikationen: freigabe.abgelaufeneQualifikationen,
      hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
    }, { status: 422 })
  }

  const warnungen: string[] = []
  if (clientCheck.probleme.length > 0 && body.force_override) {
    warnungen.push(`Client-Freigabe übersteuert: ${clientCheck.probleme.join('; ')}`)
  }
  if (freigabe.probleme.length > 0 && body.force_override) {
    warnungen.push(`Einsatzfreigabe übersteuert: ${freigabe.probleme.join('; ')}`)
  }

  const budgetCheck = await pruefeBudget(admin, client_id, organizationId)
  if (budgetCheck.blockiert && !body.force_override) {
    return NextResponse.json({
      error: `Budget-Blockierung: ${budgetCheck.warnung}`,
      hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
    }, { status: 422 })
  }
  if (budgetCheck.warnung) warnungen.push(budgetCheck.warnung)

  const insertData: Record<string, unknown> = {
    client_id,
    caregiver_id,
    start_time,
    end_time,
    service_type,
    status: assignmentStatus || 'GEPLANT',
    is_recurring: is_recurring ?? false,
    created_by: auth.userId,
    organization_id: organizationId,
  }
  if (assignment_date) insertData.assignment_date = assignment_date
  if (weekday != null) insertData.weekday = weekday
  if (valid_from) insertData.valid_from = valid_from
  if (valid_until) insertData.valid_until = valid_until
  if (address) insertData.address = address
  if (zip_code) insertData.zip_code = zip_code
  if (recurrence_rule) insertData.recurrence_rule = recurrence_rule
  if (recurrence_end) insertData.recurrence_end = recurrence_end
  if (notes) insertData.notes = notes

  const { data, error } = await supabase.from('assignments').insert(insertData).select().single()

  if (error) {
    if (error.message.includes('DOPPELBELEGUNG')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ...data, warnungen: warnungen.length > 0 ? warnungen : undefined }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { id, force_override, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id erforderlich' }, { status: 400 })

  const organizationId = await getActiveOrgId()
  if (organizationId) {
    const admin = createAdminClient()
    if (updates.caregiver_id) {
      const freigabe = await pruefeEinsatzfreigabe(admin, updates.caregiver_id, organizationId)
      if (!freigabe.freigegeben && !force_override) {
        return NextResponse.json({
          error: `Mitarbeiter "${freigabe.caregiverName}" ist nicht für Einsätze freigegeben.`,
          freigabe_probleme: freigabe.probleme,
          abgelaufene_qualifikationen: freigabe.abgelaufeneQualifikationen,
          hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
        }, { status: 422 })
      }
    }
    if (updates.client_id) {
      const clientCheck = await pruefeClientFreigabe(admin, updates.client_id, organizationId, updates.assignment_date)
      if (!clientCheck.freigegeben && !force_override) {
        return NextResponse.json({
          error: `Klient "${clientCheck.clientName}" ist nicht für Einsätze freigegeben.`,
          client_probleme: clientCheck.probleme,
          hinweis: 'Mit force_override: true kann die Zuweisung erzwungen werden.',
        }, { status: 422 })
      }
    }
  }

  const { organization_id: _oid, id: _uid, created_at: _ca, created_by: _cb, ...safeUpdates } = updates
  const updatePayload = { ...safeUpdates, updated_at: new Date().toISOString() }
  delete updatePayload.force_override
  let query = supabase
    .from('assignments')
    .update(updatePayload)
    .eq('id', id)
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query.select().single()

  if (error) {
    if (error.message.includes('DOPPELBELEGUNG')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
