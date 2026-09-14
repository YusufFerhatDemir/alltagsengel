// ═══════════════════════════════════════════════════════════════════
// GET /api/kunde/vertraege/[id]/pdf — der eigene Vertrag als Dokument
// ═══════════════════════════════════════════════════════════════════
//
// ── WARUM ES DIESE ROUTE BRAUCHT ──────────────────────────────────
// /kunde/vertraege zeigt Titel, Art, Status und Daten — also die Zeile,
// nicht das Dokument. Der Vertrags-PDF-Generator existiert seit
// ab451104, hing aber ausschliesslich an `requireAktenAdmin`: die
// Verwaltung konnte den Vertrag ausdrucken, die Kundin, die ihn
// unterschreiben soll, nicht lesen.
//
// ── DIE BERECHTIGUNG ENTSCHEIDET DIE DATENBANK ────────────────────
// Der Vertrag wird mit dem RLS-Client der Sitzung geholt. Die Policy
// `kunde_akten_vertraege_select` laesst genau die Zeilen durch, deren
// `client_id` zu einem `clients`-Eintrag mit `user_id = auth.uid()`
// gehoert, und nur nicht geloeschte. Findet die Abfrage nichts, ist die
// Antwort 404 — ohne dass diese Route selbst einen Zaun bauen muesste.
//
// Das ist Absicht: ein selbstgebauter Zaun neben einer vorhandenen
// Policy ist eine zweite Wahrheit, und die beiden laufen auseinander.
// Der Dienstschluessel kommt erst DANACH zum Einsatz, und nur fuer
// Daten, die der Kundin nicht gehoeren (`service_pricing` — der
// Stundensatz ist Betriebswissen, kein Kundendatum).
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { baueVertragPdf } from '@/lib/vertraege/vertrag-pdf'
import { istVorlagenTyp } from '@/lib/vertraege/vorlagen'
import { vertragsStundensatz } from '@/lib/vertraege/stundensatz'

export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: sitzungFehler } = await supabase.auth.getUser()
    if (sitzungFehler || !user) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 })
    }

    // RLS entscheidet: ohne Anspruch auf diese Zeile kommt nichts zurueck.
    const { data: vertrag, error: leseFehler } = await supabase
      .from('akten_vertraege')
      .select('id, client_id, organization_id, titel, vertragstyp, vertragsnummer, vertragsbeginn, vertragsende, kuendigungsfrist_tage, auto_verlaengerung')
      .eq('id', id)
      .maybeSingle()

    if (leseFehler) {
      return NextResponse.json(
        { error: 'Der Vertrag konnte nicht gelesen werden. Es wurde kein Dokument erzeugt.' },
        { status: 503 },
      )
    }
    if (!vertrag) {
      // Bewusst dieselbe Antwort wie für „gibt es nicht": ob ein Vertrag
      // unter dieser Kennung existiert, geht die anfragende Person nichts
      // an, wenn er ihr nicht gehört.
      return NextResponse.json({ error: 'Vertrag nicht gefunden.' }, { status: 404 })
    }

    if (!istVorlagenTyp(vertrag.vertragstyp)) {
      return NextResponse.json({
        error: 'Für diese Vertragsart liegt keine Druckvorlage vor. '
          + 'Bitte wenden Sie sich an Alltagsengel.',
      }, { status: 422 })
    }

    const admin = createAdminClient()

    const { data: kunde } = await admin
      .from('clients')
      .select('first_name, last_name, address, zip_code, city')
      .eq('id', vertrag.client_id)
      .maybeSingle()

    const name = [kunde?.first_name, kunde?.last_name].filter(Boolean).join(' ').trim()
    if (!name) {
      return NextResponse.json({
        error: 'Zum Vertrag ließ sich kein Name ermitteln. Es wurde kein Dokument erzeugt.',
      }, { status: 422 })
    }

    const anschrift = [
      kunde?.address,
      [kunde?.zip_code, kunde?.city].filter(Boolean).join(' ').trim() || null,
    ].filter(Boolean).join('\n')

    // Wirft UserFacingError, wenn kein eindeutiger aktiver Satz vorliegt —
    // ein Vertrag mit geratener Vergütung wäre bindend.
    const satz = await vertragsStundensatz(admin, {
      vertragstyp: vertrag.vertragstyp,
      organizationId: vertrag.organization_id as string,
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

    const dateiname = `Vertrag_${vertrag.vertragsnummer ?? String(vertrag.id).slice(0, 8)}.pdf`
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
