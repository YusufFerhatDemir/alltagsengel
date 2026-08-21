/**
 * GET /api/admin/abrechnung/credentials
 *
 * Inventar der Zugangsmittel: was wird gebraucht, was ist hinterlegt, was läuft
 * wann ab, was fehlt noch.
 *
 * Gibt NIEMALS Werte zurück — nur Zählungen, Fristen, Ampeln und Fingerprints.
 * Diese Route ist die Antwort auf "was fehlt noch, damit wir senden können",
 * nicht auf "wie lautet der Schlüssel".
 *
 * ?rotationen=1 hängt das Austauschprotokoll an (ebenfalls ohne Werte).
 */

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { credentialUebersicht, ladeRotationen, CREDENTIAL_KATALOG } from '@/lib/abrechnung/credentials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireAdminMitOrg()
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const admin = createAdminClient()

    const uebersicht = await credentialUebersicht(admin, auth.organizationId)

    const rotationen = url.searchParams.get('rotationen') === '1'
      ? await ladeRotationen(admin, auth.organizationId, {
          credentialId: url.searchParams.get('credential_id') ?? undefined,
        })
      : []

    return NextResponse.json({
      ...uebersicht,
      rotationen,
      katalog: CREDENTIAL_KATALOG,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
}
