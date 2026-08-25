import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { camtPreflight } from '@/lib/billing/camt/camt-preflight'
import { baueCamtPreflightBericht } from '@/lib/billing/camt/camt-preflight-bericht'
import { safeApiError } from '@/lib/api/error-sanitizer'

// ═══════════════════════════════════════════════════════════════
// POST /api/billing/camt/preflight
//
// Trockenlauf über eine echte Bankdatei. Diese Route BUCHT NIE — auch
// nicht, wenn CAMT_IMPORT_MODE auf LIVE steht. Das ist der Unterschied zu
// /api/billing/camt/import, das je nach Betriebsart bucht: hier soll man
// eine Datei ansehen können, ohne vorher einen Schalter umzulegen.
//
// Antwortformen:
//   (Standard)      JSON mit dem vollständigen Preflight-Ergebnis
//   ?format=text    der Pilot-Bericht als reiner Text zum Ausdrucken
//   &kurz=1         im Textbericht nur die auffälligen Buchungen
//
// Berechtigung: 'abrechnung.lesen'. Ein Trockenlauf schreibt nichts, und
// wer die Zahlungseingänge sehen darf, darf auch sehen, was aus einer Datei
// würde. Die Route liest allerdings mit service-role (BYPASSRLS) und muss
// den Mandanten deshalb selbst in jede Abfrage schreiben — das tut
// camtPreflight(), inklusive der drei bewusst mandantenübergreifenden
// Prüfabfragen, die ausschließlich `organization_id` lesen.
// ═══════════════════════════════════════════════════════════════

const MAX_CAMT_BYTES = 20 * 1024 * 1024

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireOpsAdmin('abrechnung.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 })
    }

    // Derselbe Größenriegel wie im Import: `file.text()` zieht die Datei
    // vollständig in den Speicher, und der Parser arbeitet danach mit
    // Regexen über denselben String.
    if (file.size > MAX_CAMT_BYTES) {
      return NextResponse.json(
        { error: `Datei zu groß (max. ${MAX_CAMT_BYTES / 1024 / 1024} MB).` },
        { status: 413 },
      )
    }

    const xmlInhalt = await file.text()
    if (!xmlInhalt.trim()) {
      return NextResponse.json({ error: 'Datei ist leer' }, { status: 400 })
    }

    const ergebnis = await camtPreflight(createAdminClient(), {
      organizationId,
      dateiname: file.name,
      xmlInhalt,
    })

    const { searchParams } = new URL(req.url)
    if (searchParams.get('format') === 'text') {
      const bericht = baueCamtPreflightBericht(ergebnis, {
        nurAuffaellige: searchParams.get('kurz') === '1',
        erstelltAm: new Date().toISOString(),
      })
      return new NextResponse(bericht, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          // Kein Zwischenspeicher: der Bericht hängt am Datenbestand.
          'Cache-Control': 'no-store',
        },
      })
    }

    return NextResponse.json({ gebucht: false, preflight: ergebnis }, { status: 200 })
  } catch (e) {
    return safeApiError(e, req)
  }
}
