import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { releaseCreditNote } from '@/lib/billing/core'

/**
 * POST /api/billing/corrections/[id]/release
 *
 * Gibt eine Gutschrift/Korrektur im Entwurf frei: die Gutschrift-Rechnung
 * wird auf 'freigegeben' gehoben, festgeschrieben und ein Freigabe-Snapshot
 * geschrieben. Nur fuer Administratoren.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { userId, organizationId } = auth.ctx

  try {
    const { id } = await params
    const admin = createAdminClient()
    const result = await releaseCreditNote(admin, id, userId, organizationId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/corrections/release] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
