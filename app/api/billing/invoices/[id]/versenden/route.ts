import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { versendeRechnungPerEmail } from '@/lib/billing/versand/rechnung-versand'

/**
 * POST /api/billing/invoices/[id]/versenden
 *
 * Erzeugt das Belegpaket-PDF und schickt es als E-Mail an den Klienten.
 * Nur fuer Administratoren, nur fuer die eigene Organisation.
 *
 * Body (optional): { erneutSenden?: boolean } — versendet auch dann, wenn
 * invoices.sent_at schon gesetzt ist (bewusster Nachversand).
 *
 * Antwort-Status:
 *   'versendet'      — Mail ist raus, sent_at gesetzt
 *   'uebersprungen'  — z. B. kein RESEND_API_KEY, keine E-Mail-Adresse,
 *                      Rechnung nicht festgeschrieben, bereits versendet
 *   'fehlgeschlagen' — Resend hat abgelehnt
 * Alle drei kommen mit HTTP 200 zurueck; `status` im Body ist die Wahrheit.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !rolleDarf(profile.role, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    let erneutSenden = false
    try {
      const body = await request.json()
      erneutSenden = body?.erneutSenden === true
    } catch {
      // Kein Body ist erlaubt — Standard: kein Nachversand.
    }

    const admin = createAdminClient()
    const ergebnis = await versendeRechnungPerEmail(admin, {
      invoiceId: id,
      organizationId,
      actorId: user.id,
      erneutSenden,
      // Ein Mensch hat den Versand ausgeloest: er darf einen Punkt mit
      // Sichtungsbedarf (NEEDS_REVIEW) verantworten — etwa eine
      // unvollstaendige Postanschrift. BLOCKED bleibt auch fuer ihn
      // gesperrt; das sind Befunde, die den Beleg selbst falsch machen.
      preflight: 'manuell',
    })

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
}
