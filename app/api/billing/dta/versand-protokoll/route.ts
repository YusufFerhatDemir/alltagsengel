import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ladeVersandProtokoll, type VersandKanal } from '@/lib/abrechnung/versand-protokoll'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KANAELE: VersandKanal[] = ['sftp_105', 'sftp_302', 'kim', 'manuell']

/**
 * GET /api/billing/dta/versand-protokoll?lauf_id=…&auftrag_id=…&kanal=…&limit=…
 *
 * Nachweis aller Übermittlungsversuche — auch der abgebrochenen.
 */
export async function GET(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const kanalParam = url.searchParams.get('kanal')
    if (kanalParam && !KANAELE.includes(kanalParam as VersandKanal)) {
      return NextResponse.json(
        { error: `Unbekannter Kanal "${kanalParam}". Erlaubt: ${KANAELE.join(', ')}` },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const zeilen = await ladeVersandProtokoll(admin, auth.organizationId, {
      laufId: url.searchParams.get('lauf_id') ?? undefined,
      dakotaAuftragId: url.searchParams.get('auftrag_id') ?? undefined,
      kanal: (kanalParam as VersandKanal) ?? undefined,
      limit: Number(url.searchParams.get('limit')) || undefined,
    })

    return NextResponse.json({ zeilen, anzahl: zeilen.length })
  } catch (err) {
    return safeApiError(err, request)
  }
}
