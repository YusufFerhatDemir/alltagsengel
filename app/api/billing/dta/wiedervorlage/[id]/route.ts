import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { aktualisiereWiedervorlage, type WiedervorlageStatus } from '@/lib/abrechnung/wiedervorlage'
import { safeApiError } from '@/lib/api/error-sanitizer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS: WiedervorlageStatus[] = [
  'offen', 'in_korrektur', 'korrigiert', 'eingereicht', 'erledigt', 'verworfen',
]

/**
 * PATCH /api/billing/dta/wiedervorlage/[id]
 * Body: { "status": "korrigiert", "korrektur_notiz": "…", "korrektur_daten": {…} }
 *       { "status": "verworfen", "verworfen_grund": "…" }   ← Grund ist Pflicht
 *
 * Trägt die Korrektur an einem Queue-Eintrag ein und setzt den Status.
 * Unzulässige Statuswechsel (z. B. 'offen' → 'erledigt', ohne dass je etwas
 * eingereicht wurde) werden mit 409 abgelehnt.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminMitOrg('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json()

    const status = body?.status
    if (!status || !STATUS.includes(status)) {
      return NextResponse.json(
        { error: `status ist Pflicht und muss einer von: ${STATUS.join(', ')} sein.` },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const eintrag = await aktualisiereWiedervorlage(admin, {
      eintragId: id,
      organizationId: auth.organizationId,
      actorId: auth.userId,
      neuerStatus: status,
      korrekturNotiz: typeof body?.korrektur_notiz === 'string' ? body.korrektur_notiz : undefined,
      korrekturDaten: body?.korrektur_daten && typeof body.korrektur_daten === 'object'
        ? body.korrektur_daten
        : undefined,
      verworfenGrund: typeof body?.verworfen_grund === 'string' ? body.verworfen_grund : undefined,
    })

    return NextResponse.json(eintrag)
  } catch (err) {
    return safeApiError(err, request)
  }
}
