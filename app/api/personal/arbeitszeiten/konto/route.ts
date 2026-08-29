import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import {
  listArbeitszeitKonto,
  verbindeKontoMitVerstoessen,
  zaehleOffeneArbzgVerstoesse,
  type VerstossZaehlung,
} from '@/lib/personal/arbeitszeiten'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const jahrRaw = sp.get('jahr')
    const monatRaw = sp.get('monat')
    const jahr = jahrRaw ? Number(jahrRaw) : undefined
    const monat = monatRaw ? Number(monatRaw) : undefined

    const konten = await listArbeitszeitKonto(supabase, auth.ctx.organizationId, caregiverId, jahr, monat)

    // Die Verstoesse haengen an derselben Zeile wie Ist- und Sollstunden.
    // Ein eigener Fehlerweg: bleibt die Zaehlung aus, soll das Konto
    // trotzdem stehen — eine leere Ansicht waere schlechter als eine ohne
    // die Zusatzangabe. Die Zeilen tragen dann `0`, und das waere die
    // einzige Stelle, an der `0` „unbekannt" heissen kann; deshalb wird
    // der Fehlschlag ausdruecklich mitgeteilt statt verschwiegen.
    let verstoesse: VerstossZaehlung[]
    let verstoesseFehler: string | null = null
    try {
      verstoesse = await zaehleOffeneArbzgVerstoesse(
        supabase, auth.ctx.organizationId, jahr, monat, caregiverId,
      )
    } catch (e) {
      verstoesse = []
      verstoesseFehler = (e as Error).message
    }

    // Die Antwort bleibt ein Array — die Ansicht liest bereits
    // `data.konten || data`, und ein Formwechsel haette jeden anderen
    // Leser stillschweigend auf den Fallback geschoben.
    return NextResponse.json(
      verbindeKontoMitVerstoessen(konten, verstoesse),
      verstoesseFehler ? { headers: { 'X-Verstoesse-Fehler': '1' } } : undefined,
    )
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
})
