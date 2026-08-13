import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleVoraussetzungen } from '@/lib/pilot/voraussetzungen'
import { ermittleKundenKetten } from '@/lib/pilot/kundenkette'
import { KETTEN_SCHRITTE } from '@/lib/pilot/schritte'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Obergrenze, damit die Übersicht bei wachsendem Kundenstamm nicht kippt. */
const MAX_KUNDEN = 100

/**
 * GET /api/admin/pilot
 *
 * Liefert den Pilot-Status der aktiven Organisation:
 *   - Betriebs-Voraussetzungen (darf überhaupt echt abgerechnet werden?)
 *   - Kundenketten aller aktiven Kunden (wie weit ist wer gekommen?)
 *
 * Nur lesend. Antwortet ausschliesslich mit Status- und Zählwerten,
 * niemals mit Zugangsdaten.
 */
export async function GET() {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()

    const { data: clients, error: clientsError } = await admin
      .from('clients')
      .select('id')
      .eq('organization_id', auth.organizationId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(MAX_KUNDEN)

    if (clientsError) {
      console.error('[admin/pilot] Kunden nicht lesbar:', clientsError)
      return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
    }

    const clientIds = (clients ?? []).map(c => c.id)

    const [voraussetzungen, ketten] = await Promise.all([
      ermittleVoraussetzungen(admin, auth.organizationId),
      ermittleKundenKetten(admin, auth.organizationId, clientIds),
    ])

    return NextResponse.json({
      voraussetzungen,
      ketten,
      schritte: KETTEN_SCHRITTE,
      // Ehrlich benennen, wenn die Liste abgeschnitten wurde — eine stille
      // Kappung liest sich wie "das sind alle Kunden".
      gekappt: clientIds.length >= MAX_KUNDEN,
    })
  } catch (e) {
    console.error('[admin/pilot] Unerwarteter Fehler:', e)
    return NextResponse.json({ error: 'Interner Serverfehler' }, { status: 500 })
  }
}
