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

    // Personalakte hat eine eigene Berechtigung — siehe die ausfuehrliche
    // Begruendung in app/api/akten/dokumente/route.ts. Eine ablaufende
    // Qualifikation oder ein auslaufendes Fuehrungszeugnis bleibt
    // Personalakte, auch wenn es hier nur als Frist erscheint.
    const darfPersonal = auth.ctx.darf('personal.lesen')
    const caregiverId = params.get('caregiverId') ?? undefined
    if (!darfPersonal && caregiverId) {
      return NextResponse.json(
        { error: 'Für Mitarbeiterakten fehlt Ihnen die Berechtigung.' },
        { status: 403 },
      )
    }

    const [ablauf, kundenakten, mitarbeiterakten] = await Promise.all([
      getAblaufDashboard(admin, {
        organizationId,
        ohnePersonaldokumente: !darfPersonal,
        clientId: params.get('clientId') ?? undefined,
        caregiverId,
        dringlichkeit: (params.get('dringlichkeit') as AktenAblaufEintrag['dringlichkeit']) ?? undefined,
      }),
      getKundenakteUebersicht(admin, organizationId),
      // Die Mitarbeiteruebersicht wird gar nicht erst geladen. `null` statt
      // eines leeren Arrays: eine leere Liste hiesse „keine Mitarbeiterakte
      // mit abgelaufenen Dokumenten" — eine Aussage ueber den Bestand, die
      // hier niemand treffen kann und die als Entwarnung gelesen wuerde.
      darfPersonal ? getMitarbeiterakteUebersicht(admin, organizationId) : null,
    ])

    const zusammenfassung = {
      abgelaufen: ablauf.filter(a => a.dringlichkeit === 'abgelaufen').length,
      in_7_tagen: ablauf.filter(a => a.dringlichkeit === '7_tage').length,
      in_14_tagen: ablauf.filter(a => a.dringlichkeit === '14_tage').length,
      in_30_tagen: ablauf.filter(a => a.dringlichkeit === '30_tage').length,
      in_60_tagen: ablauf.filter(a => a.dringlichkeit === '60_tage').length,
      in_90_tagen: ablauf.filter(a => a.dringlichkeit === '90_tage').length,
      kundenakten_mit_abgelaufenen: kundenakten.filter(k => k.abgelaufene_dokumente > 0).length,
      // `null`, nicht 0 — aus demselben Grund wie oben: 0 hiesse „keine",
      // und die Zahl steht in der Oberflaeche neben den anderen.
      mitarbeiterakten_mit_abgelaufenen: mitarbeiterakten
        ? mitarbeiterakten.filter(m => m.abgelaufene_dokumente > 0).length
        : null,
    }

    return NextResponse.json({ ablauf, kundenakten, mitarbeiterakten, zusammenfassung })
  } catch (err) {
    return safeApiError(err, request)
  }
})
