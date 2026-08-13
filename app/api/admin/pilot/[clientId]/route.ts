import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleKundenKette } from '@/lib/pilot/kundenkette'
import { ermittleVoraussetzungen } from '@/lib/pilot/voraussetzungen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/admin/pilot/[clientId]
 *
 * Kettenstand eines einzelnen Kunden plus die Betriebs-Voraussetzungen,
 * damit die Detailseite beide zusammen anzeigen kann.
 *
 * Die Kunden-Abfrage filtert auf die aktive Organisation — eine fremde
 * clientId liefert 404, nicht die Daten eines anderen Mandanten.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  const { clientId } = await params
  if (!UUID_RE.test(clientId)) {
    return NextResponse.json({ error: 'Ungültige Kunden-ID' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const [kette, voraussetzungen] = await Promise.all([
      ermittleKundenKette(admin, auth.organizationId, clientId),
      ermittleVoraussetzungen(admin, auth.organizationId),
    ])

    if (!kette) {
      return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 })
    }

    return NextResponse.json({ kette, voraussetzungen })
  } catch (e) {
    console.error('[admin/pilot/:clientId] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
