import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladeAbrechnungslauf } from '@/lib/abrechnung/sgb-v/abrechnungslauf'
import { ladeAufbereitung } from '@/lib/abrechnung/sgb-v/versand'
import { erzeugePruefExport, pruefExportAlsCsv, pruefExportAlsJson } from '@/lib/abrechnung/sgb-v/export-generator'

/**
 * POST /api/billing/sgb-v/laeufe/[id]/export?format=json|csv
 *
 * Liefert den internen Prüf-Export — KEIN amtlicher EDIFACT-Datensatz, siehe
 * lib/abrechnung/sgb-v/export-generator.ts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const url = new URL(request.url)
    const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'

    const admin = createAdminClient()
    const lauf = await ladeAbrechnungslauf(admin, auth.ctx.organizationId, id)
    if (!lauf) return NextResponse.json({ error: '§ 302-Lauf nicht gefunden.' }, { status: 404 })

    const aufbereitung = await ladeAufbereitung(admin, auth.ctx.organizationId, lauf.abrechnungsmonat)
    const gefiltert = lauf.kostentraeger_ik
      ? { ...aufbereitung, faelle: aufbereitung.faelle.filter(f => f.kostentraeger_ik === lauf.kostentraeger_ik) }
      : aufbereitung

    const exportDaten = erzeugePruefExport(id, lauf.abrechnungsmonat, gefiltert, new Date().toISOString())

    if (format === 'csv') {
      return new NextResponse(pruefExportAlsCsv(exportDaten), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      })
    }
    return NextResponse.json(JSON.parse(pruefExportAlsJson(exportDaten)))
  } catch (err) {
    return safeApiError(err, request)
  }
}
