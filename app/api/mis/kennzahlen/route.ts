// ═══════════════════════════════════════════════════════════════════════
// Block 28 — Kennzahlen des Kontrollzentrums
//
// Unter /api/mis/ lag bisher NICHTS. `/mis` holte seine Zahlen
// client-seitig direkt aus Supabase — ohne Mandantenbedingung auf
// `profiles`, `bookings` und `angels`. Diese Route ist die Stelle, an der
// die Organisation feststeht, bevor eine Zahl entsteht.
// ═══════════════════════════════════════════════════════════════════════
import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { withTracking } from '@/lib/monitoring/tracker'
import { ladeMisKennzahlen } from '@/lib/mis/kennzahlen'

export const GET = withTracking(async function GET(request: Request) {
  // Dasselbe Recht, das lib/auth/bereiche.ts fuer die Seite `/mis`
  // verlangt — sonst beantwortet die Route eine Frage, die die Seite
  // gar nicht stellen duerfte.
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response

  try {
    // Service-Role mit ausdruecklichem org-Fence in jeder Abfrage (siehe
    // ladeMisKennzahlen): `mis_kpis` und `caregivers` sind fuer einen
    // Teil der berechtigten Rollen per RLS nicht lesbar. Ueber den
    // RLS-Client kaeme dort eine leere Liste zurueck — und ein
    // Kontrollzentrum, das „0 Kräfte" meldet, weil es nicht hinsehen
    // darf, ist schlimmer als gar keines.
    const supabase = createAdminClient()
    const kennzahlen = await ladeMisKennzahlen(supabase, auth.ctx.organizationId)
    return NextResponse.json(kennzahlen)
  } catch (e: unknown) {
    return apiErrorResponse(e, request)
  }
})
