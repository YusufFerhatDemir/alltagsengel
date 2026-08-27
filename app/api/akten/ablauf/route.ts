import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { getAblaufDashboard, getKundenakteUebersicht, getMitarbeiterakteUebersicht } from '@/lib/akten/ablauf-warnungen'
import type { AktenAblaufEintrag } from '@/lib/akten/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()

    const [ablauf, kundenakten, mitarbeiterakten] = await Promise.all([
      getAblaufDashboard(admin, {
        organizationId,
        clientId: params.get('clientId') ?? undefined,
        caregiverId: params.get('caregiverId') ?? undefined,
        dringlichkeit: (params.get('dringlichkeit') as AktenAblaufEintrag['dringlichkeit']) ?? undefined,
      }),
      getKundenakteUebersicht(admin, organizationId),
      getMitarbeiterakteUebersicht(admin, organizationId),
    ])

    const zusammenfassung = {
      abgelaufen: ablauf.filter(a => a.dringlichkeit === 'abgelaufen').length,
      in_7_tagen: ablauf.filter(a => a.dringlichkeit === '7_tage').length,
      in_14_tagen: ablauf.filter(a => a.dringlichkeit === '14_tage').length,
      in_30_tagen: ablauf.filter(a => a.dringlichkeit === '30_tage').length,
      in_60_tagen: ablauf.filter(a => a.dringlichkeit === '60_tage').length,
      in_90_tagen: ablauf.filter(a => a.dringlichkeit === '90_tage').length,
      kundenakten_mit_abgelaufenen: kundenakten.filter(k => k.abgelaufene_dokumente > 0).length,
      mitarbeiterakten_mit_abgelaufenen: mitarbeiterakten.filter(m => m.abgelaufene_dokumente > 0).length,
    }

    return NextResponse.json({ ablauf, kundenakten, mitarbeiterakten, zusammenfassung })
  } catch (err) {
    return safeApiError(err, request)
  }
})
