import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

async function requireAuth(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile) return { ok: false as const, response: NextResponse.json({ error: 'Profil nicht gefunden' }, { status: 403 }) }
  return { ok: true as const, userId: user.id, role: profile.role }
}

function requireAdmin(auth: { ok: true; role: string }) {
  if (!['admin', 'superadmin'].includes(auth.role)) {
    return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAuth(supabase)
  if (!auth.ok) return auth.response

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const month = searchParams.get('month')
  const caregiverId = searchParams.get('caregiver_id')
  const clientId = searchParams.get('client_id')
  const proofStatus = searchParams.get('proof_status')
  const billingStatus = searchParams.get('billing_status')

  if (id) {
    const { data, error } = await supabase
      .from('service_records')
      .select('*, client:clients(first_name, last_name, zip_code), caregiver:caregivers(first_name, last_name, initials)')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 404 })

    const { data: auditLog } = await supabase
      .from('service_record_audit_log')
      .select('*')
      .eq('record_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({ ...data, audit_log: auditLog || [] })
  }

  let query = supabase
    .from('service_records')
    .select('*, client:clients(first_name, last_name), caregiver:caregivers(first_name, last_name, initials)')
    .eq('organization_id', organizationId)
    .order('date', { ascending: false })
    .limit(200)

  if (month) {
    const start = `${month}-01`
    const d = new Date(start)
    d.setMonth(d.getMonth() + 1)
    d.setDate(0)
    const end = d.toISOString().slice(0, 10)
    query = query.gte('date', start).lte('date', end)
  }
  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  if (clientId) query = query.eq('client_id', clientId)
  if (proofStatus) query = query.eq('proof_status', proofStatus)
  if (billingStatus) query = query.eq('billing_status', billingStatus)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAuth(supabase)
  if (!auth.ok) return auth.response

  const adminErr = requireAdmin(auth)
  if (adminErr) return adminErr

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const body = await req.json()
  const {
    client_id, caregiver_id, date, start_time, end_time,
    service_type, budget_type, billing_type, caregiver_initials,
    amount, notes, assignment_id, leistung_beschreibung,
    gps_start_lat, gps_start_lng,
  } = body

  if (!client_id || !caregiver_id || !date || !start_time || !end_time || !service_type) {
    return NextResponse.json({ error: 'Pflichtfelder fehlen' }, { status: 400 })
  }

  const startParts = start_time.split(':')
  const endParts = end_time.split(':')
  const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1])
  const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1])
  const duration = endMin - startMin

  const insertData: Record<string, unknown> = {
    organization_id: organizationId,
    client_id,
    caregiver_id,
    date,
    start_time,
    end_time,
    duration_minutes: duration > 0 ? duration : null,
    service_type,
    budget_type: budget_type || 'private',
    billing_type: billing_type || 'PRIVAT',
    caregiver_initials: caregiver_initials || '??',
    status: 'draft',
    proof_status: 'ENTWURF',
    billing_status: 'OFFEN',
  }
  if (amount != null) insertData.amount = amount
  if (notes) insertData.notes = notes
  if (assignment_id) insertData.assignment_id = assignment_id
  if (leistung_beschreibung) insertData.leistung_beschreibung = leistung_beschreibung
  if (gps_start_lat != null) insertData.gps_start_lat = gps_start_lat
  if (gps_start_lng != null) insertData.gps_start_lng = gps_start_lng

  const { data, error } = await supabase.from('service_records').insert(insertData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

const ERLAUBTE_PATCH_FELDER = new Set([
  'date', 'start_time', 'end_time', 'duration_minutes',
  'service_type', 'budget_type', 'billing_type',
  'amount', 'notes', 'leistung_beschreibung',
  'caregiver_initials', 'gps_end_lat', 'gps_end_lng',
])

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const auth = await requireAuth(supabase)
  if (!auth.ok) return auth.response

  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
  }

  const body = await req.json()
  const { id, action } = body

  if (!id) return NextResponse.json({ error: 'id erforderlich' }, { status: 400 })

  if (action === 'sign') {
    const { data: current } = await supabase
      .from('service_records').select('proof_status').eq('id', id).eq('organization_id', organizationId).single()
    if (!current) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    if (current.proof_status !== 'ABGESCHLOSSEN') {
      return NextResponse.json({ error: 'Unterschrift nur im Status ABGESCHLOSSEN möglich' }, { status: 409 })
    }

    const signData: Record<string, unknown> = {
      proof_status: 'UNTERSCHRIEBEN',
      client_signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (body.client_signature) signData.client_signature = body.client_signature
    if (body.client_signer_name) signData.client_signer_name = body.client_signer_name
    if (body.client_signer_role) signData.client_signer_role = body.client_signer_role
    if (body.gps_end_lat != null) signData.gps_end_lat = body.gps_end_lat
    if (body.gps_end_lng != null) signData.gps_end_lng = body.gps_end_lng

    const { data, error } = await supabase
      .from('service_records').update(signData).eq('id', id).eq('organization_id', organizationId).select().single()
    if (error) {
      if (error.message.includes('gesperrt')) {
        return NextResponse.json({ error: 'Leistungsnachweis ist gesperrt' }, { status: 423 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data)
  }

  if (action === 'confirm') {
    const { data: current } = await supabase
      .from('service_records').select('proof_status').eq('id', id).eq('organization_id', organizationId).single()
    if (!current) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
    if (current.proof_status !== 'ENTWURF') {
      return NextResponse.json({ error: 'Bestätigung nur im Status ENTWURF möglich' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('service_records')
      .update({ proof_status: 'ABGESCHLOSSEN', caregiver_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id).eq('organization_id', organizationId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'cancel') {
    if (!['admin', 'superadmin'].includes(auth.role)) {
      return NextResponse.json({ error: 'Nur Admins können stornieren' }, { status: 403 })
    }
    const { data, error } = await supabase
      .from('service_records')
      .update({ proof_status: 'STORNIERT', billing_status: 'STORNIERT', updated_at: new Date().toISOString() })
      .eq('id', id).eq('organization_id', organizationId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const [key, val] of Object.entries(body)) {
    if (ERLAUBTE_PATCH_FELDER.has(key) && val !== undefined) {
      safeUpdates[key] = val
    }
  }

  const { data, error } = await supabase
    .from('service_records')
    .update(safeUpdates)
    .eq('id', id).eq('organization_id', organizationId).select().single()
  if (error) {
    if (error.message.includes('gesperrt')) {
      return NextResponse.json({ error: 'Leistungsnachweis ist gesperrt' }, { status: 423 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
