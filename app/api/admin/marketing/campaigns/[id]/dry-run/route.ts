import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { withTracking } from '@/lib/monitoring/tracker'
import { requireMarketing } from '@/lib/marketing/api-auth'
import { trockenlauf, type Kampagne } from '@/lib/marketing/versand'

// ═══════════════════════════════════════════════════════════════════════════
// TROCKENLAUF — zählt, sendet NICHTS
//
// Diese Route ist der einzige Weg, an dem sich eine Freigabe festmachen
// kann: sie schreibt `dry_run_am` und `empfaenger_anzahl` an die Kampagne,
// und die Freigabe bindet sich an genau diese Zahl.
//
// Sie ist ein POST, obwohl sie nichts versendet — weil sie einen Zustand an
// der Kampagne aendert. Ein GET, das schreibt, waere von einem
// Link-Vorabpruefer im Mailweg ausloesbar.
// ═══════════════════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMarketing()
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const rumpf = (await request.json().catch(() => null)) as { plz?: unknown } | null

    // Regionsfilter: nur Ziffernfolgen, hoechstens fuenf Stellen. Der Wert
    // geht nie roh in eine Abfrage — filtereRegion() arbeitet auf der
    // bereits geladenen Liste.
    const plzPraefixe = Array.isArray(rumpf?.plz)
      ? rumpf.plz.map((p) => String(p).replace(/\D/g, '')).filter((p) => p.length > 0 && p.length <= 5)
      : []

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('id, organization_id, name, template_key, segment_key, status, dry_run_am, empfaenger_anzahl, freigegeben_am, freigegeben_fuer_anzahl, versendet_am')
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'Kampagne nicht gefunden.' }, { status: 404 })

    const kampagne = data as unknown as Kampagne
    const ergebnis = await trockenlauf(supabase, kampagne, new Date(), plzPraefixe)

    // Ein neuer Trockenlauf entwertet eine bestehende Freigabe. Sonst
    // koennte man freigeben, das Segment veraendern, erneut trocken laufen
    // und mit der alten Freigabe versenden.
    if (kampagne.freigegeben_am) {
      const { error: entwertFehler } = await supabase
        .from('email_campaigns')
        .update({ freigegeben_am: null, freigegeben_von: null, freigegeben_fuer_anzahl: null })
        .eq('id', id)
        .eq('organization_id', auth.ctx.organizationId)
        .is('versendet_am', null)
        .select('id')
      if (entwertFehler) throw new Error(entwertFehler.message)
    }

    return NextResponse.json({
      ...ergebnis,
      freigabeEntwertet: Boolean(kampagne.freigegeben_am),
      hinweis:
        'Trockenlauf — es wurde NICHTS versendet. Die Zahl „versandfähig" ist die Zahl der ' +
        'Empfänger nach Einwilligung und Sperrliste.',
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
