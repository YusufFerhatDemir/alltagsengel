import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { pruefeRechnungVersandbereit, darfVersenden } from '@/lib/billing/preflight/rechnung-preflight'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// GET /api/billing/invoices/[id]/preflight
//
// Die 16-Punkte-Prüfung als eigener, lesender Aufruf: „darf dieser Beleg
// raus, und wenn nein, warum nicht?" — beantwortbar, ohne zu versenden.
//
// Diese Route SCHREIBT NICHTS. Sie erzeugt kein PDF, setzt keinen Status,
// schreibt keinen Audit-Eintrag. Sie ist beliebig oft aufrufbar.
//
// ?erneutSenden=1  Punkt 15 („kein bereits erfolgter Versand") wird zu
//                  'nicht_anwendbar' statt 'blockiert' — für die Frage
//                  „dürfte ich diesen Beleg NACHsenden?"
//
// Der Versandweg selbst ruft dieselbe Funktion; diese Route ist keine
// zweite Prüfung, sondern derselbe Code ohne die Nebenwirkung.
// ═══════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx
    const { id } = await params

    const { searchParams } = new URL(req.url)
    const erneutSenden = searchParams.get('erneutSenden') === '1'

    const ergebnis = await pruefeRechnungVersandbereit(createAdminClient(), {
      invoiceId: id,
      organizationId,
      erneutSenden,
    })

    // Beide Urteile mitliefern: derselbe Beleg kann für einen Menschen
    // versendbar sein und für den Automaten nicht. Wer die Antwort liest,
    // soll das sehen, ohne die Regel selbst nachzubauen.
    return NextResponse.json({
      ...ergebnis,
      urteil: {
        automatisch: darfVersenden(ergebnis, 'automatisch'),
        manuell: darfVersenden(ergebnis, 'manuell'),
      },
    })
  } catch (e) {
    return safeApiError(e, req)
  }
}
