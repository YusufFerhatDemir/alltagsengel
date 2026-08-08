import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 }) }
  }
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id, organizationId }
}

function generateCustomerNumber(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `KD-${yy}${mm}-${rand}`
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    if (!body.first_name?.trim() || !body.last_name?.trim()) {
      return NextResponse.json({ error: 'Vor- und Nachname sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()

    if (body.customer_number) {
      const { data: existing } = await admin
        .from('clients')
        .select('id')
        .eq('customer_number', body.customer_number)
        .eq('organization_id', auth.organizationId)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: 'Kundennummer bereits vergeben.' }, { status: 409 })
      }
    }

    const insertData: Record<string, unknown> = {
      organization_id: auth.organizationId,
      customer_number: body.customer_number?.trim() || generateCustomerNumber(),
      first_name: body.first_name.trim(),
      last_name: body.last_name.trim(),
      status: 'new',
      pipeline_status: 'erstgespraech',
    }

    const optionalFields = [
      'date_of_birth', 'address', 'city', 'zip_code', 'phone', 'email',
      'care_level', 'insurance_name', 'insurance_number', 'versichertennummer',
      'pflegekasse_name', 'pflegekasse_ik', 'pflegegrad', 'geschlecht',
      'notes', 'emergency_contact_name', 'emergency_contact_phone',
      'emergency_contact_relationship', 'hausarzt_name', 'hausarzt_phone',
    ]

    for (const field of optionalFields) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== '') {
        insertData[field] = body[field]
      }
    }

    if (body.care_level != null) {
      const cl = Number(body.care_level)
      if (cl < 1 || cl > 5 || !Number.isInteger(cl)) {
        return NextResponse.json({ error: 'Pflegegrad muss zwischen 1 und 5 liegen.' }, { status: 400 })
      }
      insertData.care_level = cl
      insertData.pflegegrad = cl
    }

    const { data: client, error: insertError } = await admin
      .from('clients')
      .insert(insertData)
      .select()
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ client }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
