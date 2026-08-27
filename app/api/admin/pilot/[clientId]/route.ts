import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleKundenKette } from '@/lib/pilot/kundenkette'
import { ermittleVoraussetzungen } from '@/lib/pilot/voraussetzungen'
import { withTracking } from '@/lib/monitoring/tracker'

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
export const GET = withTracking(async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireAdminMitOrg('system.verwalten')
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
    return safeApiError(e, _request)
  }
})
