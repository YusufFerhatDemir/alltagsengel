import { NextRequest, NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSigAdmin } from '@/lib/signaturen/api-auth'
import { listeDokumente, erstelleDokument } from '@/lib/signaturen/signaturen'
import { SIGNATUR_DOKUMENT_TYPEN, type SignaturDokumentTyp } from '@/lib/signaturen/types'
import { withTracking } from '@/lib/monitoring/tracker'

// Dienstschluessel, weil signatur_dokumente live NUR eine is_admin()-Policy
// traegt (28.08.2026 aus pg_policies gelesen). pdl/qm/buchhaltung kamen
// ueber den Guard herein und bekamen mit dem RLS-Client eine LEERE Liste
// ohne Fehler. Der Fence liegt deshalb im Code: organizationId aus dem
// Auth-Kontext UND die Erlaubnisliste der Dokumentarten aus dem Guard —
// beides in JEDER Abfrage, siehe lib/signaturen/signaturen.ts.

export const GET = withTracking(async function GET(req: NextRequest) {
  const auth = await requireSigAdmin('lesen')
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const roh = url.searchParams.get('dokument_typ') || undefined
  const dokument_typ =
    roh && SIGNATUR_DOKUMENT_TYPEN.includes(roh as SignaturDokumentTyp)
      ? (roh as SignaturDokumentTyp)
      : undefined

  try {
    const dokumente = await listeDokumente(
      createAdminClient(),
      auth.ctx.organizationId,
      auth.ctx.sichtbareTypen,
      { dokument_typ },
    )
    return NextResponse.json(dokumente)
  } catch (err) {
    return safeApiError(err, req)
  }
})

export const POST = withTracking(async function POST(req: NextRequest) {
  const auth = await requireSigAdmin('schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await req.json()
    const dokument = await erstelleDokument(
      createAdminClient(),
      auth.ctx.organizationId,
      auth.ctx.userId,
      body,
      auth.ctx.sichtbareTypen,
    )
    return NextResponse.json(dokument, { status: 201 })
  } catch (err) {
    return safeApiError(err, req)
  }
})
