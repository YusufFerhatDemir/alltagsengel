import { NextResponse } from 'next/server'
import type { Berechtigung } from '@/lib/auth/rollen'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'
import { berlinParts } from '@/lib/utils/timezone'
import { erstelleInitialBudgets } from '@/lib/budget/auto-budget'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

/**
 * Lokaler Guard dieser Route. Prueft seit dem Rollenkonzept eine
 * BERECHTIGUNG statt der Rolle (lib/auth/rollen.ts) — Klienten-Stammdaten
 * sehen auch pdl/qm/buchhaltung, aendern duerfen sie nur admin und pdl.
 */
async function requireAdmin(berechtigung: Berechtigung = 'stammdaten.lesen') {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false as const, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }
  const quellen = await holeRollenQuellenFuer(supabase, user)
  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false as const, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id, organizationId }
}

function generateCustomerNumber(): string {
  const p = berlinParts(new Date())
  const yy = p.year.slice(-2)
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `KD-${yy}${p.month}-${rand}`
}

export const POST = withTracking(async function POST(req: Request) {
  const auth = await requireAdmin('stammdaten.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()

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

    // ── Anlage, robust gegen den engeren Live-Constraint ──────────────
    // clients_status_check lässt live NUR ('active','paused','inactive') zu.
    // Das hier fachlich richtige 'new' (siehe CLIENT_STATUS in lib/admin/ops)
    // wird mit Fehler 23514 abgewiesen — dadurch war die Neuanlage über die
    // Oberfläche vollständig blockiert und der Admin sah nur eine rohe
    // Postgres-Meldung.
    //
    // Bis die Migration 20260907010000_clients_status_check.sql angewendet
    // ist, degradiert die Anlage kontrolliert auf 'inactive': der Klient
    // existiert, ist aber noch nicht in Betreuung — die Lebenszyklus-Stufe
    // steht ohnehin in pipeline_status ('erstgespraech').
    const STATUS_FALLBACK = 'inactive'
    const hinweise: string[] = []

    let { data: client, error: insertError } = await admin
      .from('clients')
      .insert(insertData)
      .select()
      .single()

    if (insertError?.code === '23514' && insertError.message.includes('clients_status_check')) {
      ;({ data: client, error: insertError } = await admin
        .from('clients')
        .insert({ ...insertData, status: STATUS_FALLBACK })
        .select()
        .single())
      if (!insertError) {
        hinweise.push(
          `Status „Neu" ist in der Datenbank noch nicht freigeschaltet — der Klient wurde als „Inaktiv" angelegt. ` +
          `Migration 20260907010000_clients_status_check.sql anwenden.`
        )
      }
    }

    if (insertError || !client) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Klient konnte nicht angelegt werden.' },
        { status: 500 }
      )
    }

    await logAuditEvent({
      action: 'create',
      actorId: auth.userId,
      organizationId: auth.organizationId,
      entityType: 'client',
      entityId: client.id,
      details: { customer_number: client.customer_number, name: `${client.first_name} ${client.last_name}` },
      request: req,
    })

    // Budget-Anlage darf nicht still scheitern: ohne Budget steht der Kunde
    // in der Kette bei Schritt 3 und niemand sieht warum. Der Klient bleibt
    // angelegt (der Datensatz ist gültig), der Fehler wandert in die Antwort.
    const careLevel = client.care_level ?? client.pflegegrad ?? 0
    if (careLevel >= 1) {
      const pgMonat = body.pflegegrad_seit_monat
        ? parseInt(body.pflegegrad_seit_monat, 10)
        : undefined
      const budget = await erstelleInitialBudgets(admin, client.id, auth.organizationId, careLevel, pgMonat)
      if (budget.fehler) hinweise.push(`Budget konnte nicht angelegt werden: ${budget.fehler}`)
    }

    return NextResponse.json({ client, hinweise }, { status: 201 })
  } catch (err) {
    return safeApiError(err, req)
  }
})
