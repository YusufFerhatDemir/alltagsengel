import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  const { data, error } = await supabase.rpc('get_calendar_assignments', {
    p_start: start,
    p_end: end,
    p_caregiver_id: caregiverId,
    p_client_id: clientId,
    p_bundesland: bundesland,
    p_status: status,
  })

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

  const insertData: Record<string, unknown> = {
    client_id,
    caregiver_id,
    start_time,
    end_time,
    service_type,
    status: assignmentStatus || 'GEPLANT',
    is_recurring: is_recurring ?? false,
    created_by: auth.userId,
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

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireStaff(supabase)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { id, ...updates } = body

  if (!id) return NextResponse.json({ error: 'id erforderlich' }, { status: 400 })

  const { data, error } = await supabase
    .from('assignments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.message.includes('DOPPELBELEGUNG')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
