import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from './audit'
import { isTerminalStatus, isValidInvoiceStatus, type InvoiceStatus } from './status-machine'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Typ fuer client-Join-Ergebnis aus Supabase-Abfragen. */
type ClientJoin = { first_name?: string; last_name?: string; email?: string } | null

export type PaymentMethod =
  | 'ueberweisung' | 'lastschrift' | 'bar' | 'scheck'
  | 'kassen_sammelueberweisung' | 'rueckzahlung'

export type PayerType = 'kunde' | 'kostentraeger' | 'sonstiger'

export type MatchingStatus =
  | 'automatisch_zugeordnet' | 'zuordnung_vorschlag'
  | 'manuell_zugeordnet' | 'manuelle_pruefung'
  | 'nicht_zugeordnet' | 'teilweise_zugeordnet'

export type AllocationType =
  | 'vollzahlung' | 'teilzahlung' | 'ueberzahlung'
  | 'sammelzahlung_anteil' | 'gutschrift_verrechnung'

export interface CreatePaymentParams {
  organizationId: string
  paymentDate: string
  amountCents: number
  paymentMethod: PaymentMethod
  payerType: PayerType
  payerName?: string
  payerReference?: string
  bankReference?: string
  verwendungszweck?: string
  notes?: string
  actorId: string
  /**
   * Automatische Rechnungszuordnung nach dem Anlegen (Default: true).
   *
   * FALSE setzen, wenn der Aufrufer die Zuordnung selbst vornimmt. Sonst
   * ordnet autoMatchPayment() bereits zu und die anschliessende explizite
   * allocatePayment() scheitert an der Ueberzahlungspruefung
   * („Zuordnung uebersteigt Zahlungsbetrag") — die Zahlung ist dann korrekt
   * verbucht, der Aufrufer bekommt aber einen Fehler. Genau so war
   * POST /api/billing/invoices/[id]/zahlung fuer jede Vollzahlung kaputt.
   */
  autoMatch?: boolean
}

export interface PaymentResult {
  paymentId: string
  matchingStatus: MatchingStatus
  matchedInvoices: MatchedInvoice[]
}

export interface MatchedInvoice {
  invoiceId: string
  invoiceNumber: string
  allocatedCents: number
  confidence: number
}

export interface AllocatePaymentParams {
  paymentId: string
  allocations: { invoiceId: string; amountCents: number; notes?: string }[]
  actorId: string
}

// ---------------------------------------------------------------------------
// createPayment
// ---------------------------------------------------------------------------

export async function createPayment(
  supabase: SupabaseClient,
  params: CreatePaymentParams
): Promise<PaymentResult> {
  const {
    organizationId, paymentDate, amountCents, paymentMethod,
    payerType, payerName, payerReference, bankReference,
    verwendungszweck, notes, actorId, autoMatch = true,
  } = params

  if (amountCents <= 0) throw new Error('Zahlungsbetrag muss positiv sein.')

  const { data: payment, error } = await supabase
    .from('payments')
    .insert({
      organization_id: organizationId,
      payment_date: paymentDate,
      amount_cents: amountCents,
      payment_method: paymentMethod,
      payer_type: payerType,
      payer_name: payerName || null,
      payer_reference: payerReference || null,
      bank_reference: bankReference || null,
      verwendungszweck: verwendungszweck || null,
      notes: notes || null,
      created_by: actorId,
      matching_status: 'nicht_zugeordnet',
    })
    .select('id')
    .single()

  if (error || !payment) {
    throw new Error(`Zahlung konnte nicht erstellt werden: ${error?.message}`)
  }

  await logBillingAction(supabase, {
    entityType: 'payment',
    organizationId,
    entityId: payment.id,
    action: 'created',
    newState: { amount_cents: amountCents, payment_method: paymentMethod, payer_name: payerName },
    actorId,
  })

  // Ohne Auto-Matching bleibt der Zahlungseingang bewusst unzugeordnet —
  // der Aufrufer verbucht ihn selbst auf eine konkrete Rechnung.
  if (!autoMatch) {
    return {
      paymentId: payment.id,
      matchingStatus: 'nicht_zugeordnet',
      matchedInvoices: [],
    }
  }

  const matched = await autoMatchPayment(supabase, payment.id, {
    amountCents,
    verwendungszweck: verwendungszweck || '',
    payerName: payerName || '',
    bankReference: bankReference || '',
    organizationId,
  })

  return {
    paymentId: payment.id,
    matchingStatus: matched.matchingStatus,
    matchedInvoices: matched.matches,
  }
}

// ---------------------------------------------------------------------------
// autoMatchPayment
// ---------------------------------------------------------------------------

interface MatchInput {
  amountCents: number
  verwendungszweck: string
  payerName: string
  bankReference: string
  organizationId: string
}

interface MatchOutput {
  matchingStatus: MatchingStatus
  matches: MatchedInvoice[]
}

async function autoMatchPayment(
  supabase: SupabaseClient,
  paymentId: string,
  input: MatchInput
): Promise<MatchOutput> {
  const { amountCents, verwendungszweck, payerName, organizationId } = input

  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, total_amount, paid_amount, client_id, insurance_name, client:clients(first_name, last_name)')
    .eq('organization_id', organizationId)
    .not('status', 'in', '("bezahlt","storniert","akzeptiert")')
    .is('deleted_at', null)

  if (!openInvoices || openInvoices.length === 0) {
    return { matchingStatus: 'nicht_zugeordnet', matches: [] }
  }

  const candidates: (MatchedInvoice & { score: number })[] = []

  for (const inv of openInvoices) {
    let score = 0
    const totalCents = Math.round(Number(inv.total_amount || 0) * 100)
    const paidCents = Math.round(Number(inv.paid_amount || 0) * 100)
    const openCents = totalCents - paidCents

    if (openCents <= 0) continue

    const invNum = inv.invoice_number_formatted || inv.invoice_number || ''
    const vz = verwendungszweck.toUpperCase()

    if (invNum && vz.includes(invNum.toUpperCase())) {
      score += 50
    }

    if (amountCents === openCents) {
      score += 30
    } else if (Math.abs(amountCents - openCents) <= 2) {
      score += 20
    }

    const rawClient = inv.client as unknown as ClientJoin
    const clientName = rawClient
      ? `${rawClient.first_name || ''} ${rawClient.last_name || ''}`.trim().toUpperCase()
      : ''
    if (clientName && payerName.toUpperCase().includes(clientName)) {
      score += 15
    }

    if (inv.insurance_name && payerName.toUpperCase().includes(inv.insurance_name.toUpperCase())) {
      score += 10
    }

    if (score > 0) {
      candidates.push({
        invoiceId: inv.id,
        invoiceNumber: invNum,
        allocatedCents: Math.min(amountCents, openCents),
        confidence: Math.min(score, 100),
        score,
      })
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    return { matchingStatus: 'nicht_zugeordnet', matches: [] }
  }

  const best = candidates[0]

  if (best.score >= 70) {
    await allocatePayment(supabase, {
      paymentId,
      allocations: [{ invoiceId: best.invoiceId, amountCents: best.allocatedCents }],
      actorId: 'system',
    })
    return {
      matchingStatus: 'automatisch_zugeordnet',
      matches: [best],
    }
  }

  await supabase
    .from('payments')
    .update({ matching_status: 'zuordnung_vorschlag' })
    .eq('id', paymentId)

  return {
    matchingStatus: 'zuordnung_vorschlag',
    matches: candidates.slice(0, 5).map(c => ({
      invoiceId: c.invoiceId,
      invoiceNumber: c.invoiceNumber,
      allocatedCents: c.allocatedCents,
      confidence: c.confidence,
    })),
  }
}

// ---------------------------------------------------------------------------
// allocatePayment
// ---------------------------------------------------------------------------

export async function allocatePayment(
  supabase: SupabaseClient,
  params: AllocatePaymentParams
): Promise<void> {
  const { paymentId, allocations, actorId } = params

  const { data: payment } = await supabase
    .from('payments')
    .select('id, amount_cents, allocated_cents, organization_id')
    .eq('id', paymentId)
    .single()

  if (!payment) throw new Error(`Zahlung ${paymentId} nicht gefunden.`)

  let totalAllocating = 0
  for (const alloc of allocations) {
    if (alloc.amountCents <= 0) throw new Error('Zuordnungsbetrag muss positiv sein.')
    totalAllocating += alloc.amountCents
  }

  const newAllocated = (payment.allocated_cents || 0) + totalAllocating
  if (newAllocated > payment.amount_cents) {
    throw new Error(
      `Zuordnung (${newAllocated} Cent) übersteigt Zahlungsbetrag (${payment.amount_cents} Cent).`
    )
  }

  for (const alloc of allocations) {
    // Org-Fence im Kern, nicht nur in der Route: allocatePayment laeuft mit
    // Service-Role (BYPASSRLS). Ohne diese Bedingung liesse sich eine Zahlung
    // der eigenen Organisation auf eine Rechnung einer FREMDEN Organisation
    // verbuchen — deren OPOS und Rechnungsstatus waeren damit von aussen
    // manipulierbar.
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, total_amount, paid_amount, status')
      .eq('id', alloc.invoiceId)
      .eq('organization_id', payment.organization_id)
      .maybeSingle()

    if (!inv) {
      throw new Error(
        `Rechnung ${alloc.invoiceId} nicht gefunden oder gehoert nicht zur Organisation der Zahlung.`
      )
    }

    if (isValidInvoiceStatus(inv.status) && isTerminalStatus(inv.status as InvoiceStatus)) {
      throw new Error(
        `Rechnung ${alloc.invoiceId} ist im Endstatus "${inv.status}" — Zuordnung nicht moeglich.`
      )
    }

    const totalCents = Math.round(Number(inv.total_amount || 0) * 100)
    const prevPaidCents = Math.round(Number(inv.paid_amount || 0) * 100)
    const openCents = totalCents - prevPaidCents
    if (alloc.amountCents > openCents && openCents > 0) {
      throw new Error(
        `Zuordnungsbetrag (${alloc.amountCents} Cent) uebersteigt offenen Betrag (${openCents} Cent) der Rechnung ${alloc.invoiceId}.`
      )
    }
    const newPaidCents = prevPaidCents + alloc.amountCents

    const isMulti = allocations.length > 1
    let allocationType: AllocationType = 'teilzahlung'
    if (newPaidCents >= totalCents) allocationType = 'vollzahlung'
    if (newPaidCents > totalCents) allocationType = 'ueberzahlung'
    if (isMulti && allocationType !== 'ueberzahlung') allocationType = 'sammelzahlung_anteil'

    const { error: allocError } = await supabase
      .from('payment_allocations')
      .insert({
        organization_id: payment.organization_id,
        payment_id: paymentId,
        invoice_id: alloc.invoiceId,
        amount_cents: alloc.amountCents,
        allocation_type: allocationType,
        allocated_by: actorId === 'system' ? null : actorId,
        notes: alloc.notes || null,
      })

    if (allocError) {
      throw new Error(`Zuordnung fehlgeschlagen: ${allocError.message}`)
    }

    const newStatus = newPaidCents >= totalCents ? 'bezahlt' : 'teilweise_bezahlt'
    // OCC: only update if paid_amount hasn't changed since we read it
    const { data: updatedInv, error: invUpdateErr } = await supabase
      .from('invoices')
      .update({
        paid_amount: newPaidCents / 100,
        paid_at: new Date().toISOString(),
        status: newStatus,
      })
      .eq('id', alloc.invoiceId)
      .eq('paid_amount', inv.paid_amount ?? 0)
      .select('id')

    if (invUpdateErr) {
      throw new Error(`Rechnungs-Update fehlgeschlagen: ${invUpdateErr.message}`)
    }
    if (!updatedInv?.length) {
      throw new Error(
        `Konkurrierender Zugriff auf Rechnung ${alloc.invoiceId} — bitte erneut versuchen.`
      )
    }

    if (newPaidCents < totalCents && totalCents - newPaidCents > 0) {
      await supabase
        .from('dunning_entries')
        .update({ amount_paid_cents: newPaidCents })
        .eq('invoice_id', alloc.invoiceId)
    } else {
      await supabase
        .from('dunning_entries')
        .update({ dunning_level: 'bezahlt', amount_paid_cents: newPaidCents })
        .eq('invoice_id', alloc.invoiceId)
    }

    await logBillingAction(supabase, {
      entityType: 'payment_allocation',
      organizationId: payment.organization_id,
      entityId: paymentId,
      action: 'allocated',
      newState: {
        invoice_id: alloc.invoiceId,
        amount_cents: alloc.amountCents,
        allocation_type: allocationType,
        new_invoice_status: newStatus,
      },
      actorId,
    })
  }

  const matchingStatus: MatchingStatus = newAllocated >= payment.amount_cents
    ? (actorId === 'system' ? 'automatisch_zugeordnet' : 'manuell_zugeordnet')
    : 'teilweise_zugeordnet'

  // OCC: only update if allocated_cents hasn't changed since we read it
  const { data: updatedPayment } = await supabase
    .from('payments')
    .update({ allocated_cents: newAllocated, matching_status: matchingStatus })
    .eq('id', paymentId)
    .eq('allocated_cents', payment.allocated_cents ?? 0)
    .select('id')

  if (!updatedPayment?.length) {
    throw new Error(
      `Konkurrierender Zugriff auf Zahlung ${paymentId} — bitte erneut versuchen.`
    )
  }
}

// ---------------------------------------------------------------------------
// recordPaymentDifference
// ---------------------------------------------------------------------------

export interface RecordDifferenceParams {
  organizationId: string
  invoiceId: string
  sollCents: number
  istCents: number
  kuerzungGrund?: string
  kuerzungKategorie?: string
  widerspruchFrist?: string
  actorId: string
}

export async function recordPaymentDifference(
  supabase: SupabaseClient,
  params: RecordDifferenceParams
): Promise<string> {
  const {
    organizationId, invoiceId, sollCents, istCents,
    kuerzungGrund, kuerzungKategorie, widerspruchFrist, actorId,
  } = params

  if (istCents >= sollCents) {
    throw new Error('Ist-Betrag ist nicht kleiner als Soll-Betrag — keine Differenz.')
  }

  // Org-Fence im Kern: die Funktion setzt weiter unten invoices.status auf
  // 'gekuerzt'. Mit Service-Role (BYPASSRLS) waere das ohne diese Pruefung ein
  // Schreibzugriff auf die Rechnung einer beliebigen fremden Organisation.
  const { data: zielRechnung } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!zielRechnung) {
    throw new Error(
      `Rechnung ${invoiceId} nicht gefunden oder gehoert nicht zur angegebenen Organisation.`
    )
  }

  const { data, error } = await supabase
    .from('payment_differences')
    .insert({
      organization_id: organizationId,
      invoice_id: invoiceId,
      soll_cents: sollCents,
      ist_cents: istCents,
      kuerzung_grund: kuerzungGrund || null,
      kuerzung_kategorie: kuerzungKategorie || null,
      widerspruch_frist: widerspruchFrist || null,
      created_by: actorId,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Differenz konnte nicht erfasst werden: ${error?.message}`)
  }

  await supabase
    .from('invoices')
    .update({ status: 'gekuerzt' })
    .eq('id', invoiceId)

  await logBillingAction(supabase, {
    entityType: 'payment_difference',
    organizationId,
    entityId: data.id,
    action: 'created',
    newState: {
      invoice_id: invoiceId,
      soll_cents: sollCents,
      ist_cents: istCents,
      differenz_cents: sollCents - istCents,
      kuerzung_grund: kuerzungGrund,
    },
    actorId,
  })

  return data.id
}
