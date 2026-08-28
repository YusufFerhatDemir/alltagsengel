import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { createPayment, allocatePayment, type PaymentMethod, type PayerType } from '@/lib/billing/core'
import { getActiveOrgId } from '@/lib/organizations/server'
import { safeApiError } from '@/lib/api/error-sanitizer'

import { euroZuCent, centRunden } from '@/lib/geld'
import { withTracking } from '@/lib/monitoring/tracker'
import { holeRollenQuellenFuer, quellenDuerfen } from '@/lib/auth/rollen-quelle'
// Spiegel der Union-Typen aus lib/billing/core/payments.ts. Fail-closed:
// ein unbekannter Wert wird hier abgewiesen und nicht an den DB-CHECK
// durchgereicht, der nur eine rohe Postgres-Meldung zurückgibt.
const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'ueberweisung', 'lastschrift', 'bar', 'scheck',
  'kassen_sammelueberweisung', 'rueckzahlung',
]
const PAYER_TYPES: readonly PayerType[] = ['kunde', 'kostentraeger', 'sonstiger']

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
    const {
      paymentDate, amountCents, paymentMethod, payerType, payerName,
      payerReference, bankReference, verwendungszweck, notes, autoMatch,
      invoiceId,
    } = body

    // Direkte Rechnungszuordnung (manuelle Erfassung aus der Oberflaeche):
    // mit invoiceId wird das Auto-Matching abgeschaltet und der Betrag
    // ausdruecklich auf diese Rechnung gebucht.
    if (invoiceId !== undefined && (typeof invoiceId !== 'string' || !invoiceId)) {
      return NextResponse.json({ error: 'invoiceId muss eine Rechnungs-ID sein.' }, { status: 400 })
    }

    // JJJJ-MM-TT: ohne Formatprüfung landete jede Falscheingabe als roher
    // Postgres-Fehler beim Nutzer.
    if (typeof paymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return NextResponse.json({ error: 'paymentDate muss im Format JJJJ-MM-TT angegeben werden.' }, { status: 400 })
    }

    // Number('abc') ist NaN, und NaN <= 0 ist false — die alte Prüfung ließ
    // jeden nicht-numerischen Betrag durch und schrieb NaN in die Spalte.
    const betrag = Number(amountCents)
    if (!Number.isFinite(betrag) || betrag <= 0) {
      return NextResponse.json({ error: 'amountCents muss eine positive Zahl in CENT sein.' }, { status: 400 })
    }

    const methode: PaymentMethod = paymentMethod || 'ueberweisung'
    if (!PAYMENT_METHODS.includes(methode)) {
      return NextResponse.json(
        { error: `Ungültige Zahlungsart "${methode}". Erlaubt: ${PAYMENT_METHODS.join(', ')}.` },
        { status: 400 }
      )
    }

    const zahlerTyp: PayerType = payerType || 'kunde'
    if (!PAYER_TYPES.includes(zahlerTyp)) {
      return NextResponse.json(
        { error: `Ungültiger Zahlertyp "${zahlerTyp}". Erlaubt: ${PAYER_TYPES.join(', ')}.` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Org-Fence vor dem Anlegen: createPayment/allocatePayment laufen mit
    // Service-Role (BYPASSRLS). Ohne diese Pruefung liesse sich eine Zahlung
    // auf die Rechnung einer FREMDEN Organisation buchen.
    let offenCents: number | null = null
    if (invoiceId) {
      const { data: rechnung } = await admin
        .from('invoices')
        .select('id, total_amount, paid_amount, status')
        .eq('id', invoiceId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .maybeSingle()

      if (!rechnung) {
        return NextResponse.json({ error: 'Rechnung nicht gefunden.' }, { status: 404 })
      }

      const gesamtCents = euroZuCent(rechnung.total_amount || 0)
      const bezahltCents = euroZuCent(rechnung.paid_amount || 0)
      offenCents = gesamtCents - bezahltCents

      if (offenCents <= 0) {
        return NextResponse.json(
          { error: 'Die Rechnung ist bereits vollständig ausgeglichen.' },
          { status: 409 }
        )
      }
    }

    const result = await createPayment(admin, {
      organizationId,
      paymentDate,
      amountCents: centRunden(betrag),
      paymentMethod: methode,
      payerType: zahlerTyp,
      payerName,
      payerReference,
      bankReference,
      verwendungszweck,
      notes,
      actorId: user.id,
      // Durchgereicht, damit die manuelle Erfassung die Zuordnung selbst
      // vornehmen kann. Ohne autoMatch:false ordnet createPayment bereits zu
      // und ein anschliessendes allocatePayment scheitert an der
      // Ueberzahlungspruefung (siehe CreatePaymentParams).
      ...(invoiceId || autoMatch === false ? { autoMatch: false } : {}),
    })

    if (!invoiceId || offenCents === null) {
      return NextResponse.json(result)
    }

    // Teil- und Ueberzahlung: hoechstens der offene Betrag wird verbucht.
    // allocatePayment weist eine Zuordnung ueber den offenen Betrag hinaus
    // ab — der Ueberschuss bleibt als nicht zugeordneter Zahlungseingang
    // stehen und laesst sich spaeter auf eine andere Rechnung verteilen.
    const betragCents = centRunden(betrag)
    const zuordnungCents = Math.min(betragCents, offenCents)
    const ueberzahlungCents = betragCents - zuordnungCents

    await allocatePayment(admin, {
      paymentId: result.paymentId,
      allocations: [{
        invoiceId,
        amountCents: zuordnungCents,
        ...(typeof notes === 'string' && notes ? { notes } : {}),
      }],
      actorId: user.id,
    })

    return NextResponse.json({
      ...result,
      matchingStatus: ueberzahlungCents > 0 ? 'teilweise_zugeordnet' : 'manuell_zugeordnet',
      zugeordnetCents: zuordnungCents,
      /** > 0, wenn mehr gezahlt wurde als offen war — bleibt unzugeordnet. */
      ueberzahlungCents,
      /** true, wenn die Rechnung mit dieser Zahlung ausgeglichen ist. */
      rechnungAusgeglichen: zuordnungCents >= offenCents,
    })
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 500)

    const admin = createAdminClient()
    let query = admin
      .from('payments')
      .select('*, payment_allocations(id, invoice_id, amount_cents, allocation_type)')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('matching_status', status)

    const { data, error } = await query
    if (error) return safeApiError(error, request)

    return NextResponse.json({ payments: data || [] })
  } catch (err) {
    return safeApiError(err, request)
  }
})
