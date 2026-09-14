// ═══════════════════════════════════════════════════════════════════
// GET /api/akten/vertraege/[id]/pdf — der Vertrag als Dokument
// ═══════════════════════════════════════════════════════════════════
//
// `akten_vertraege` traegt die Spalten `pdf_url` und `vorlage_id` seit
// jeher, beide live durchgehend NULL: ein Vertrag existierte nur als
// Datenbankzeile. Diese Route macht daraus ein Blatt, das jemand
// unterschreiben kann.
//
// Es wird NICHTS gespeichert und nichts versendet. Das PDF entsteht bei
// jedem Aufruf neu aus dem aktuellen Stand und geht direkt an den
// Aufrufer. Ein abgelegtes Dokument waere ein zweiter Wahrheitsstand
// neben der Zeile — und eine Datei, die niemand mitpflegt, wenn sich der
// Vertrag aendert.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAktenAdmin } from '@/lib/akten/api-auth'
import { getVertrag } from '@/lib/akten/vertraege'
import { withTracking } from '@/lib/monitoring/tracker'
import { baueVertragPdf } from '@/lib/vertraege/vertrag-pdf'
import { istVorlagenTyp, VORLAGEN_TYPEN } from '@/lib/vertraege/vorlagen'
import { vertragsStundensatz } from '@/lib/vertraege/stundensatz'

export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const auth = await requireAktenAdmin('stammdaten.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const vertrag = await getVertrag(admin, id, organizationId)
    if (!vertrag) return NextResponse.json({ error: 'Vertrag nicht gefunden.' }, { status: 404 })

    if (!istVorlagenTyp(vertrag.vertragstyp)) {
      return NextResponse.json({
        error: `Für die Vertragsart „${vertrag.vertragstyp}" ist keine Vorlage hinterlegt. `
          + `Vorlagen gibt es für: ${VORLAGEN_TYPEN.join(', ')}.`,
      }, { status: 422 })
    }

    // Der Auftraggeber. Ein Vertrag ohne benannte Partei ist keiner —
    // deshalb hier ebenfalls fail-closed statt „Unbekannt" aufs Blatt.
    if (!vertrag.client_id) {
      return NextResponse.json({
        error: 'Der Vertrag ist keinem Kunden zugeordnet. Es wurde kein Dokument erzeugt.',
      }, { status: 422 })
    }

    const { data: kunde } = await admin
      .from('clients')
      .select('first_name, last_name, address, zip_code, city')
      .eq('id', vertrag.client_id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    const name = [kunde?.first_name, kunde?.last_name].filter(Boolean).join(' ').trim()
    if (!name) {
      return NextResponse.json({
        error: 'Zum Vertrag liess sich kein Kundenname ermitteln. Es wurde kein Dokument erzeugt.',
      }, { status: 422 })
    }

    const anschrift = [
      kunde?.address,
      [kunde?.zip_code, kunde?.city].filter(Boolean).join(' ').trim() || null,
    ].filter(Boolean).join('\n')

    // Wirft UserFacingError, wenn kein eindeutiger aktiver Satz vorliegt.
    const satz = await vertragsStundensatz(admin, {
      vertragstyp: vertrag.vertragstyp,
      organizationId,
    })

    const pdf = await baueVertragPdf({
      typ: vertrag.vertragstyp,
      auftraggeber: name,
      auftraggeberAnschrift: anschrift || null,
      vertragsnummer: vertrag.vertragsnummer,
      vertragsbeginn: vertrag.vertragsbeginn,
      vertragsende: vertrag.vertragsende,
      kuendigungsfristTage: vertrag.kuendigungsfrist_tage,
      autoVerlaengerung: vertrag.auto_verlaengerung,
      stundensatzEuro: satz.euro,
      verguetungsQuelle: satz.quelle,
    })

    const dateiname = `Vertrag_${vertrag.vertragsnummer ?? vertrag.id.slice(0, 8)}.pdf`
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${dateiname}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
