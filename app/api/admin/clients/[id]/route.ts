import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { logAuditEvent } from '@/lib/audit-log'

// Felder, die über die "Gesundheitsdaten & Notfallkontakte"-Sektion
// (app/admin/clients/[id]/page.tsx, HealthSection) editierbar sind.
const ALLOWED_FIELDS = [
  'allergies', 'medications', 'mobility_status', 'dietary_restrictions', 'medical_conditions',
  'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
  'next_of_kin_name', 'next_of_kin_phone', 'next_of_kin_email', 'next_of_kin_relationship',
  'hausarzt_name', 'hausarzt_phone',
  'versichertennummer', 'pflegekasse_name', 'pflegekasse_ik',
] as const

const MOBILITY_VALUES = ['mobil', 'eingeschraenkt', 'rollstuhl', 'bettlaegerig']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

/**
 * PATCH /api/admin/clients/[id]
 *
 * Aktualisiert Gesundheitsdaten & Notfallkontakte eines Klienten.
 *
 * Vorher schrieb HealthSection (app/admin/clients/[id]/page.tsx) direkt per
 * Browser-Client gegen `clients` — RLS (clients_admin_all + org_fence)
 * schützte den Schreibzugriff korrekt, aber es entstand KEIN Audit-Log-
 * Eintrag. Damit war die Klienten-Anlage (POST /api/admin/clients) und die
 * Pflegegrad-Änderung (PATCH .../pflegegrad) auditiert, Änderungen an
 * Allergien/Medikamenten/Notfallkontakten aber nicht. Diese Route schließt
 * die Lücke, ohne das Nutzerverhalten zu ändern.
 *
 * Es werden absichtlich nur die GEÄNDERTEN FELDNAMEN geloggt, nicht die
 * Werte selbst — Allergien/Medikamente/Diagnosen sind Gesundheitsdaten und
 * gehören nicht als Klartext in den Audit-Log.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await req.json()

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
    }

    if (
      body.mobility_status !== undefined && body.mobility_status !== null &&
      body.mobility_status !== '' && !MOBILITY_VALUES.includes(body.mobility_status)
    ) {
      return NextResponse.json({ error: 'Ungültiger Wert für Mobilität.' }, { status: 400 })
    }

    if (body.next_of_kin_email && !EMAIL_RE.test(String(body.next_of_kin_email))) {
      return NextResponse.json({ error: 'E-Mail-Adresse des Angehörigen ist ungültig.' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        const v = body[field]
        updateData[field] = typeof v === 'string' ? (v.trim() || null) : v
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Keine Felder zum Speichern übergeben.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: client, error: updateError } = await admin
      .from('clients')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', auth.organizationId)
      .select('id, first_name, last_name')
      .maybeSingle()

    if (updateError) {
      return safeApiError(updateError)
    }
    if (!client) {
      return NextResponse.json({ error: 'Klient nicht gefunden.' }, { status: 404 })
    }

    await logAuditEvent({
      action: 'update',
      actorId: auth.userId,
      organizationId: auth.organizationId,
      entityType: 'client',
      entityId: id,
      details: {
        feld: 'gesundheitsdaten_notfallkontakte',
        geaenderte_felder: Object.keys(updateData),
        name: `${client.first_name} ${client.last_name}`,
      },
      request: req,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return safeApiError(err, req)
  }
}
