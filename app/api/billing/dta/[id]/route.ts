import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

export const GET = withTracking(async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)

    if (!quellenDuerfen(quellen, 'abrechnung.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const admin = createAdminClient()

    const { data: lauf } = await admin
      .from('abrechnungslaeufe')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()

    if (!lauf) {
      return NextResponse.json({ error: 'Lauf nicht gefunden.' }, { status: 404 })
    }

    // ── Warum hier JEDER Fehler zaehlt ──────────────────────────────
    //
    // Diese Ansicht ist der Ort, an dem ein Mensch entscheidet, ob ein
    // Abrechnungslauf in Ordnung ist. Ihre Aussagekraft steckt fast
    // vollstaendig in den LEEREN Listen: „kein Fehlerprotokoll", „keine
    // Ruecklaeufer" heisst hier „der Lauf ist sauber durchgegangen".
    //
    // Mit verworfenem Fehler traf die Ansicht genau diese Aussage auch
    // dann, wenn sie die Protokolle gar nicht lesen konnte. Ein
    // abgewiesener Lauf mit Ruecklaeufern der Kasse sah dann aus wie ein
    // beanstandungsfreier — und wurde als erledigt abgehakt.
    //
    // Es faellt deshalb die ganze Ansicht aus, nicht einzelne Teile: eine
    // halb geladene Laufuebersicht ist schlechter als gar keine, weil man
    // ihr nicht ansieht, welche Haelfte fehlt.
    const [rechnungenRes, dakotaRes, validierungenRes, fehlerRes, ruecklaeuferRes] =
      await Promise.all([
        admin
          .from('dta_lauf_rechnungen')
          .select('*, invoice:invoices(id, invoice_number_formatted, total_amount, status, client_id)')
          .eq('lauf_id', id)
          .order('position_im_lauf'),
        admin.from('dta_dakota_auftraege').select('*').eq('lauf_id', id),
        admin
          .from('dta_validierungen')
          .select('*')
          .eq('lauf_id', id)
          .order('created_at', { ascending: false })
          .limit(1),
        admin
          .from('dta_fehlerprotokoll')
          .select('*')
          .eq('lauf_id', id)
          .order('created_at', { ascending: false }),
        admin
          .from('dta_ruecklaeufer')
          .select('*')
          .eq('lauf_id', id)
          .order('created_at', { ascending: false }),
      ])

    const teilFehler = [rechnungenRes, dakotaRes, validierungenRes, fehlerRes, ruecklaeuferRes]
      .find(r => r.error)?.error
    if (teilFehler) {
      return NextResponse.json(
        { error: 'Der Abrechnungslauf konnte nicht vollständig geladen werden. Fehlerprotokoll und Rückläufer werden nicht als leer angezeigt, solange sie nicht lesbar sind.' },
        { status: 500 },
      )
    }

    const rechnungen = rechnungenRes.data
    const dakotaAuftraege = dakotaRes.data
    const validierungen = validierungenRes.data
    const fehler = fehlerRes.data
    const ruecklaeufer = ruecklaeuferRes.data

    return NextResponse.json({
      lauf,
      rechnungen: rechnungen ?? [],
      dakotaAuftraege: dakotaAuftraege ?? [],
      validierung: validierungen?.[0] ?? null,
      fehler: fehler ?? [],
      ruecklaeufer: ruecklaeufer ?? [],
    })
  } catch (err) {
    return safeApiError(err, _request)
  }
})
