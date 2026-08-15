import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { automatischeZahlungszuordnungSgbV, sgbVOffenePostenListe } from '@/lib/abrechnung/sgb-v/zahlungsabgleich'

/** GET /api/billing/sgb-v/zahlungen — OPOS-Liste der § 302-Läufe. */
export async function GET() {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const offenePosten = await sgbVOffenePostenListe(admin, auth.ctx.organizationId)
    return NextResponse.json({ offenePosten })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/zahlungen] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** POST /api/billing/sgb-v/zahlungen — automatischen Zahlungsabgleich anstossen. */
export async function POST() {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const ergebnis = await automatischeZahlungszuordnungSgbV(admin, auth.ctx.organizationId, auth.ctx.userId)
    return NextResponse.json(ergebnis)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/sgb-v/zahlungen] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
