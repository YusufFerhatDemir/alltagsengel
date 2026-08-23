import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeAbrechnungslauf } from '@/lib/abrechnung/sgb-v/abrechnungslauf'
import { ladeSgbVRuecklaeufer } from '@/lib/abrechnung/sgb-v/ruecklaufer-service'
import { ladeWarteschlange } from '@/lib/abrechnung/sgb-v/transport-adapter'
import { ladeSgbVKorrekturHistorie } from '@/lib/abrechnung/sgb-v/storno-korrektur'

/** GET /api/billing/sgb-v/laeufe/[id] — Detail inkl. Rückläufer, Queue, Korrekturhistorie. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const admin = createAdminClient()
    const lauf = await ladeAbrechnungslauf(admin, auth.ctx.organizationId, id)
    if (!lauf) return NextResponse.json({ error: '§ 302-Lauf nicht gefunden.' }, { status: 404 })

    const [ruecklaeufer, queue, korrekturHistorie] = await Promise.all([
      ladeSgbVRuecklaeufer(admin, auth.ctx.organizationId, id),
      ladeWarteschlange(admin, auth.ctx.organizationId, id),
      ladeSgbVKorrekturHistorie(admin, auth.ctx.organizationId, id),
    ])

    return NextResponse.json({ lauf, ruecklaeufer, queue, korrekturHistorie })
  } catch (err) {
    return safeApiError(err, request)
  }
}
