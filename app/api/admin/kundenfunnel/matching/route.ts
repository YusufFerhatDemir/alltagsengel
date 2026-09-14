import { NextResponse, type NextRequest } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveOrgId } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import { findePassendeEngel, type EngelDaten } from '@/lib/kunde/matching'
import { istKundenanfrage } from '@/lib/admin/ops'

/**
 * GET /api/admin/kundenfunnel/matching?leadId=…
 *
 * Welche Engel kommen für diese Kundenanfrage in Frage?
 *
 * ── VORSCHLAG, KEINE ZUTEILUNG ────────────────────────────────────────
 * Diese Route SCHREIBT NICHTS. Sie ordnet niemanden zu und legt keinen
 * Einsatz an — sie beantwortet eine Frage für einen Menschen, der danach
 * entscheidet. Deshalb GET und kein POST.
 *
 * ── WARUM DER DIENSTSCHLÜSSEL ─────────────────────────────────────────
 * `caregivers` ist für die Verwaltung über RLS lesbar, aber die Auswahl
 * muss VOLLSTÄNDIG sein: ein Engel, den eine Policy ausblendet, fehlte im
 * Vorschlag, ohne dass jemand den Grund sähe — und genau die stille Lücke
 * soll das Ergebnis ja vermeiden (es nennt jeden Ausschluss mit Grund).
 *
 * Der Mandantenfilter steht deshalb ausdrücklich in BEIDEN Abfragen. Er ist
 * hier die einzige Grenze, nicht RLS.
 *
 * ── WAS NICHT HERAUSGEHT ──────────────────────────────────────────────
 * Aus `caregivers` werden nur die Felder gelesen, die das Matching braucht.
 * Keine Geburtsdaten, keine Sozialversicherungsnummer, keine internen
 * Notizen — die stehen in derselben Tabelle und haben in einem
 * Vorschlagsergebnis nichts zu suchen.
 */
export const GET = withTracking(async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })
    }

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'stammdaten.lesen')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const leadId = (new URL(req.url).searchParams.get('leadId') || '').trim()
    if (!leadId) {
      return NextResponse.json({ error: 'leadId fehlt.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: lead, error: leadFehler } = await admin
      .from('lead_inquiries')
      .select('id, name, plz, service, art, source, anfrage_daten')
      .eq('id', leadId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (leadFehler) return safeApiError(leadFehler, req)
    if (!lead) return NextResponse.json({ error: 'Anfrage nicht gefunden.' }, { status: 404 })

    // Eine Bewerbung ist keine Kundenanfrage — für sie gibt es keine
    // passenden Engel, sie IST einer in spe.
    if (!istKundenanfrage(lead)) {
      return NextResponse.json(
        { error: 'Dieser Vorgang ist eine Bewerbung, keine Kundenanfrage.' },
        { status: 400 },
      )
    }

    if (!lead.plz) {
      return NextResponse.json({
        error: 'Die Anfrage hat keine Postleitzahl — ohne sie lässt sich die Anfahrt nicht beurteilen.',
      }, { status: 422 })
    }

    const { data: engel, error: engelFehler } = await admin
      .from('caregivers')
      // Ausdrückliche Spaltenliste als Literal, nicht zusammengebaut: eine
      // dynamische Zeichenkette nimmt dem Schema-Drift-Check die Grundlage,
      // und er ist hier der Riegel gegen eine tote Abfrage (42703).
      .select('id, first_name, last_name, zip_code, einsatzgebiet_plz, einsatzgebiet_radius_km, qualification_level, qualifications, is_nurse, languages, has_vehicle, einsatzfreigabe, status, vertragsstatus, austrittsdatum')
      .eq('organization_id', organizationId)

    if (engelFehler) return safeApiError(engelFehler, req)

    const daten = (lead.anfrage_daten ?? {}) as Record<string, unknown>
    const kandidaten: EngelDaten[] = ((engel ?? []) as unknown as Record<string, unknown>[]).map(e => ({
      id: String(e.id),
      name: [e.first_name, e.last_name].filter(Boolean).join(' ').trim() || '—',
      zip_code: (e.zip_code as string | null) ?? null,
      einsatzgebiet_plz: (e.einsatzgebiet_plz as string[] | null) ?? null,
      einsatzgebiet_radius_km: (e.einsatzgebiet_radius_km as number | null) ?? null,
      qualification_level: (e.qualification_level as string | null) ?? null,
      qualifications: (e.qualifications as string[] | null) ?? null,
      is_nurse: (e.is_nurse as boolean | null) ?? null,
      languages: (e.languages as string[] | null) ?? null,
      has_vehicle: (e.has_vehicle as boolean | null) ?? null,
      einsatzfreigabe: (e.einsatzfreigabe as boolean | null) ?? null,
      status: (e.status as string | null) ?? null,
      vertragsstatus: (e.vertragsstatus as string | null) ?? null,
      austrittsdatum: (e.austrittsdatum as string | null) ?? null,
    }))

    const ergebnis = findePassendeEngel(kandidaten, {
      plz: String(lead.plz),
      leistung: (lead.service as string | null) ?? null,
      pflegegrad: typeof daten.pflegegrad === 'string' ? daten.pflegegrad : null,
    })

    return NextResponse.json({
      anfrage: { id: lead.id, name: lead.name, plz: lead.plz, leistung: lead.service ?? null },
      gepruefte: kandidaten.length,
      ...ergebnis,
    })
  } catch (err) {
    return safeApiError(err, req)
  }
})
