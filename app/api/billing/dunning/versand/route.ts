import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { verarbeiteMahnQueue } from '@/lib/billing/dunning/mahn-versand'

/**
 * POST /api/billing/dunning/versand
 *
 * Arbeitet die wartenden Eintraege aus dunning_email_queue der eigenen
 * Organisation ab: PDF erzeugen, Mahnung per E-Mail schicken, Status
 * setzen. Vor jedem Versand wird geprueft, ob die Rechnung inzwischen
 * bezahlt oder blockiert ist — dann wird storniert statt gemahnt.
 *
 * Body (optional):
 *   { limit?: number, wiederholen?: boolean }
 *   `wiederholen` nimmt auch Eintraege mit status='fehlgeschlagen' mit.
 *
 * GET liefert nur die Zaehler der Queue, ohne etwas zu versenden.
 */
export async function POST(request: Request) {
  try {
    const auth = await pruefeAdmin()
    if (!auth.ok) return auth.response
    const { admin, organizationId, userId } = auth

    let limit = 100
    let wiederholen = false
    try {
      const body = await request.json()
      if (Number.isFinite(Number(body?.limit))) {
        limit = Math.min(Math.max(1, Math.round(Number(body.limit))), 500)
      }
      wiederholen = body?.wiederholen === true
    } catch {
      // Kein Body ist erlaubt.
    }

    const ergebnis = await verarbeiteMahnQueue(admin, {
      organizationId,
      limit,
      wiederholen,
      actorId: userId,
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
}

export async function GET(request: Request) {
  try {
    const auth = await pruefeAdmin()
    if (!auth.ok) return auth.response
    const { admin, organizationId } = auth

    const { data, error } = await admin
      .from('dunning_email_queue')
      .select('status')
      .eq('organization_id', organizationId)

    if (error) return safeApiError(error, request)

    const zaehler: Record<string, number> = {
      wartend: 0, versendet: 0, fehlgeschlagen: 0, storniert: 0,
    }
    for (const z of data || []) zaehler[z.status] = (zaehler[z.status] || 0) + 1

    return NextResponse.json({ queue: zaehler, gesamt: data?.length ?? 0 })
  } catch (err) {
    return safeApiError(err, request)
  }
}

type AdminPruefung =
  | { ok: false; response: NextResponse }
  | { ok: true; admin: ReturnType<typeof createAdminClient>; organizationId: string; userId: string }

async function pruefeAdmin(): Promise<AdminPruefung> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return { ok: true, admin: createAdminClient(), organizationId, userId: user.id }
}
