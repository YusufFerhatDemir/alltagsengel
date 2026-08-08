import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleReadiness } from '@/lib/abrechnung/readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/dta/readiness
 *
 * Zentrale Bereitschaftsansicht der aktiven Organisation. Antwortet
 * ausschliesslich mit Status- und Zählwerten — keine Zertifikatsinhalte,
 * keine SSH-Keys, keine Passwörter, nur deren Existenz als Ja/Nein.
 */
export async function GET() {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const readiness = await ermittleReadiness(admin, auth.organizationId)
    return NextResponse.json(readiness)
  } catch (e) {
    console.error('[dta/readiness] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
