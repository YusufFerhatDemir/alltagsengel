import { createClient } from '@/lib/supabase/server'
import { centRunden } from '@/lib/geld'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { recordPaymentDifference, logBillingAction } from '@/lib/billing/core'
import { planeDifferenzPatch } from '@/lib/billing/core/differenzen'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'

export const POST = withTracking(async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
    // NICHT an profiles — profiles hat keine organization_id-Spalte.
    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { invoiceId, sollCents, istCents, kuerzungGrund, kuerzungKategorie, widerspruchFrist } = body

    if (!invoiceId || !sollCents || istCents === undefined) {
      return NextResponse.json({ error: 'invoiceId, sollCents und istCents erforderlich.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Org-Fence: recordPaymentDifference laeuft mit Service-Role (BYPASSRLS).
    const { data: invoice } = await admin
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!invoice) {
      return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
    }

    const diffId = await recordPaymentDifference(admin, {
      organizationId,
      invoiceId,
      // centRunden: eine Kuerzung kann als negative Differenz ankommen,
      // und Math.round(-0.5) laege einen Cent daneben.
      sollCents: centRunden(sollCents),
      istCents: centRunden(istCents),
      kuerzungGrund,
      kuerzungKategorie,
      widerspruchFrist,
      actorId: user.id,
    })

    return NextResponse.json({ differenceId: diffId })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const GET = withTracking(async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

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
    const { data, error } = await admin
      .from('payment_differences')
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, client:clients(first_name, last_name))')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) return safeApiError(error, request)
    return NextResponse.json({ differences: data || [] })
  } catch (err) {
    return safeApiError(err, request)
  }
})

// ═══════════════════════════════════════════════════════════════════════
// PATCH /api/billing/differences — Lebenszyklus einer Kuerzung
// ═══════════════════════════════════════════════════════════════════════
//
// Bis hierhin gab es NUR Erfassen (POST) und Auflisten (GET). Eine einmal
// festgehaltene Kuerzung blieb damit fuer immer im Zustand 'offen': ein
// Widerspruch liess sich nicht einlegen, ein Ergebnis nicht festhalten,
// ein Restbetrag nicht abschreiben.
//
// Der schwerere Teil davon steht in lib/billing/core/differenzen.ts: die
// beiden Mahnbremsen suchen nach 'widerspruch_eingereicht' und
// 'nachforderung', und ohne diesen Handler konnte kein Codepfad diese
// Werte je schreiben — die Sperre gegen das Mahnen bestrittener
// Forderungen war unerreichbar.
export const PATCH = withTracking(async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 })

    const quellen = await holeRollenQuellenFuer(supabase, user)
    if (!quellenDuerfen(quellen, 'abrechnung.schreiben')) {
      return NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 })
    }

    const organizationId = await getActiveOrgId()
    if (!organizationId) {
      return NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...rest } = body ?? {}
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id erforderlich.' }, { status: 400 })
    }

    // UNBEKANNTE FELDER WERDEN ABGEWIESEN, nicht verworfen. Ein stillschweigend
    // verworfenes Feld quittiert die Oberflaeche als „gespeichert", obwohl nichts
    // gespeichert wurde — der teuerste Fall davon waere ein Geldfeld.
    const erlaubt = ['status', 'notizen', 'frist', 'nachforderungCents', 'gutschriftCents', 'abschreibungCents']
    const unbekannt = Object.keys(rest).filter(k => !erlaubt.includes(k))
    if (unbekannt.length > 0) {
      return NextResponse.json(
        { error: `Unbekannte Felder: ${unbekannt.join(', ')}. Zulässig sind: ${erlaubt.join(', ')}.` },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    // Org-Fence als EINZIGE Grenze: dieser Weg faehrt mit dem Dienstschluessel,
    // RLS sieht ihn nie. Der Bestand wird ausserdem gebraucht, weil der Plan
    // von differenz_cents und vom bisherigen Zustand abhaengt.
    const { data: bestand, error: leseFehler } = await admin
      .from('payment_differences')
      .select('id, differenz_cents, widerspruch_status, widerspruch_at, nachforderung_cents, gutschrift_cents, abschreibung_cents')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (leseFehler) return safeApiError(leseFehler, request)
    if (!bestand) return NextResponse.json({ error: 'Kürzung nicht gefunden.' }, { status: 404 })

    const plan = planeDifferenzPatch(bestand, rest, new Date().toISOString(), user.id)
    if (!plan.ok) return NextResponse.json({ error: plan.fehler }, { status: 400 })

    const { data, error } = await admin
      .from('payment_differences')
      .update(plan.patch)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*, invoice:invoices(id, invoice_number, invoice_number_formatted, total_amount, client:clients(first_name, last_name))')
      .single()

    if (error) return safeApiError(error, request)

    await logBillingAction(admin, {
      entityType: 'payment_difference',
      organizationId,
      entityId: id,
      action: 'updated',
      previousState: {
        widerspruch_status: bestand.widerspruch_status,
        nachforderung_cents: bestand.nachforderung_cents,
        gutschrift_cents: bestand.gutschrift_cents,
        abschreibung_cents: bestand.abschreibung_cents,
      },
      newState: plan.patch,
      actorId: user.id,
    })

    return NextResponse.json({ difference: data })
  } catch (err) {
    return safeApiError(err, request)
  }
})
