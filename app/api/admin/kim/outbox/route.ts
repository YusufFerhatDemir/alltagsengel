import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKimAdmin } from '@/lib/kim/api-auth'
import { listMessages } from '@/lib/kim/message-service'
import { processOutbox, pollDeliveryStatuses } from '@/lib/kim/outbox-service'
import { resolveOrgProvider } from '@/lib/kim/provider-config-service'
import { ermittleVersandModus, KimBetriebsmodusError } from '@/lib/kim/versandmodus'

export async function GET(request: Request) {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response

  try {
    const sb = await createClient()
    const [gesendet, wartend, fehler] = await Promise.all([
      listMessages(sb, auth.ctx.organizationId, { direction: 'outbound', status: 'gesendet' }),
      listMessages(sb, auth.ctx.organizationId, { direction: 'outbound', status: 'wartend' }),
      listMessages(sb, auth.ctx.organizationId, { direction: 'outbound', status: 'fehler' }),
    ])
    const zugestellt = await listMessages(sb, auth.ctx.organizationId, { direction: 'outbound', status: 'zugestellt' })
    const gelesen = await listMessages(sb, auth.ctx.organizationId, { direction: 'outbound', status: 'gelesen' })
    // Der Betriebsmodus gehört in die Liste, nicht nur in die Verarbeitung:
    // wer die Outbox ansieht, muss erkennen, ob die Status echt sind.
    const provider = await resolveOrgProvider(sb, auth.ctx.organizationId)
    return NextResponse.json({
      gesendet: [...gesendet, ...zugestellt, ...gelesen], wartend, fehler,
      betriebsmodus: ermittleVersandModus(provider),
    })
  } catch (e) {
    return safeApiError(e, request)
  }
}

/** Verarbeitet die Warteschlange (Versand + Zustellstatus-Abfrage). */
export async function POST(_req: NextRequest) {
  const auth = await requireKimAdmin()
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const sb = await createClient()
    const provider = await resolveOrgProvider(sb, auth.ctx.organizationId)
    const sendSummary = await processOutbox(admin, provider, auth.ctx.organizationId, auth.ctx.userId)
    const polled = await pollDeliveryStatuses(admin, provider, auth.ctx.organizationId, auth.ctx.userId)
    return NextResponse.json({
      ...sendSummary,
      statusAktualisiert: polled,
      betriebsmodus: ermittleVersandModus(provider),
    })
  } catch (e: unknown) {
    // 409 statt 500: "Simulator im Echtbetrieb" ist kein Serverfehler, sondern
    // ein bewusst herbeigeführter Abbruch mit klarer Handlungsanweisung.
    if (e instanceof KimBetriebsmodusError) {
      return apiErrorResponse(e, _req, 409)
    }
    const msg = e instanceof Error ? e.message : 'Unbekannter Fehler'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
