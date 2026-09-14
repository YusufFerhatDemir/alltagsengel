import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { fuehreTaeglicheAutomatisierungAus } from '@/lib/automation'
import { raeumeZustellspurAuf } from '@/lib/notifications/aufraeumen'
import { pflegeFeiertagskatalog } from '@/lib/automation/feiertage-pflege'
import { pruefeCronGeheimnis } from '@/lib/api/cron-auth'
import { withTracking } from '@/lib/monitoring/tracker'

// ═══════════════════════════════════════════════════════════
// CRON: TAEGLICHE AUTOMATISIERUNGSKETTEN (WS7)
// ═══════════════════════════════════════════════════════════
// Laeuft taeglich um 05:00 Uhr (vercel.json) — vor dem Mahnlauf (07:00),
// damit Fristen-/Budget-/Nachweis-Aufgaben schon stehen, wenn der Tag
// beginnt. Iteriert alle Organisationen, jede Kette pro Organisation
// fehlertolerant (siehe lib/automation/index.ts).
// ═══════════════════════════════════════════════════════════

const supabaseAdmin = createAdminClient()

export const GET = withTracking(async function GET(request: Request) {
  const abweisung = pruefeCronGeheimnis(request)
  if (abweisung) return abweisung

  try {
    const { data: orgs, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, name')

    if (orgError) {
      return safeApiError(orgError, request)
    }

    const laeufe: Array<Record<string, unknown>> = []
    for (const org of orgs || []) {
      try {
        // katalogpflege: false — der Feiertagskatalog ist bundesweit und
        // wird nach der Schleife EINMAL gepflegt, nicht je Mandant.
        const ergebnis = await fuehreTaeglicheAutomatisierungAus(supabaseAdmin, org.id, org.id, {
          katalogpflege: false,
        })
        laeufe.push({ name: org.name, ...ergebnis })
      } catch (err) {
        laeufe.push({
          organizationId: org.id,
          name: org.name,
          fehler: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Zustellspur aufraeumen — bewusst EINMAL pro Lauf, nicht je
    // Organisation: cleanup_notification_delivery_log() loescht nach
    // Alter, nicht nach Mandant (siehe lib/notifications/aufraeumen.ts).
    const zustellspur = await raeumeZustellspurAuf(supabaseAdmin)

    // Feiertagskatalog aus demselben Grund EINMAL: `billing_feiertage`
    // hat kein `organization_id`. In der Mandantenschleife lief die
    // Pflege sechsmal taeglich, und jede Organisation wies "importiert:
    // 76" fuer bundesweite Daten aus, die ihr nicht gehoeren.
    const feiertage = await pflegeFeiertagskatalog(supabaseAdmin)

    return NextResponse.json({ ok: true, organisationen: laeufe.length, laeufe, zustellspur, feiertage })
  } catch (err) {
    return safeApiError(err, request)
  }
})
