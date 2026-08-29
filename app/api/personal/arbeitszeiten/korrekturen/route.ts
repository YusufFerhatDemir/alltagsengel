import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listZeitkorrekturen } from '@/lib/personal/zeitkorrekturen'
import { withTracking } from '@/lib/monitoring/tracker'
import { UserFacingError } from '@/lib/api/user-facing-error'

/**
 * Obergrenze fuer eine Abfrage auf das Korrekturprotokoll.
 *
 * Ohne sie lief die Abfrage unbegrenzt: `limit` kam ungeprueft aus der
 * Adresszeile, und fehlte es, wurde gar nicht begrenzt. Das Protokoll
 * waechst mit jeder Korrektur und wird nie kleiner — eine Ansicht ohne
 * Deckel wird also mit der Zeit von selbst zum Problem, ohne dass sich
 * etwas am Code aendert.
 */
const MAX_LIMIT = 500
const STANDARD_LIMIT = 200

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const arbeitszeitId = sp.get('arbeitszeitId') ?? undefined
    // Ein unbrauchbares `limit` wird ABGEWIESEN, nicht stillschweigend
    // verworfen: `Number('viele')` ist NaN und damit falsy — die alte
    // Fassung haette daraus „keine Begrenzung" gemacht, also das Gegenteil
    // dessen, was der Aufrufer wollte, und es nicht gesagt.
    const limitRoh = sp.get('limit')
    let limit = STANDARD_LIMIT
    if (limitRoh !== null) {
      const n = Number(limitRoh)
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
        throw new UserFacingError(
          `limit muss eine ganze Zahl zwischen 1 und ${MAX_LIMIT} sein.`, 400,
        )
      }
      limit = n
    }

    const data = await listZeitkorrekturen(supabase, {
      organizationId: auth.ctx.organizationId,
      caregiverId,
      arbeitszeitId,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})
