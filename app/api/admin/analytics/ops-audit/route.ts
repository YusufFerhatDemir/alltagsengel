import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeOpsAudit, type OpsAuditQuelle } from '@/lib/analytics/opsAudit'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const von = url.searchParams.get('von') || undefined
  const bis = url.searchParams.get('bis') || undefined
  const aktion = url.searchParams.get('aktion') || undefined
  const akteur = url.searchParams.get('akteur') || undefined
  const quelle = (url.searchParams.get('quelle') || undefined) as OpsAuditQuelle | undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 200

  try {
    // Admin-Client: billing_audit_trail + ops_aktivitaetslog werden über
    // mehrere Quellen zusammengeführt — organizationId wird explizit gesetzt.
    const supabase = createAdminClient()
    const entries = await ladeOpsAudit(supabase, {
      organizationId: auth.ctx.organizationId,
      von,
      bis,
      aktion,
      akteur,
      quelle,
      limit,
    })
    return NextResponse.json(entries)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
