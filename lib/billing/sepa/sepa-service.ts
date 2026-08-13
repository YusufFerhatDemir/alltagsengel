// ═══════════════════════════════════════════════════════════════
// SEPA-Lastschrift Service — Mandate + Batch-Verwaltung
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { generatePain008, validateIban, generateMandateReference } from './pain008'
import type { SepaDirectDebitItem } from './pain008'
import { pruefeGlaeubigerIdOderWerfe } from './glaeubiger-id'
import { logBillingAction } from '../core/audit'
import { heuteBerlin } from '@/lib/utils/timezone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MandateStatus = 'aktiv' | 'pausiert' | 'widerrufen' | 'abgelaufen'
export type BatchStatus = 'erstellt' | 'freigegeben' | 'exportiert' | 'eingereicht' | 'verarbeitet' | 'fehlerhaft'

export interface CreateMandateParams {
  organizationId: string
  clientId: string
  debtorName: string
  debtorIban: string
  debtorBic?: string
  mandateDate: string
  mandateType?: 'CORE' | 'B2B'
  actorId: string
}

export interface CreateBatchParams {
  organizationId: string
  invoiceIds: string[]
  requestedCollectionDate: string
  actorId: string
}

// ---------------------------------------------------------------------------
// createMandate — SEPA-Lastschriftmandat anlegen
// ---------------------------------------------------------------------------

export async function createMandate(
  supabase: SupabaseClient,
  params: CreateMandateParams
) {
  const { organizationId, clientId, debtorName, debtorIban, debtorBic, mandateDate, mandateType, actorId } = params

  const cleanIban = debtorIban.replace(/\s+/g, '').toUpperCase()
  if (!validateIban(cleanIban)) {
    throw new Error(`Ungültige IBAN: ${debtorIban}`)
  }

  // Client-Nummer für Mandatsreferenz
  const { data: client } = await supabase
    .from('clients')
    .select('client_number, first_name, last_name')
    .eq('id', clientId)
    .single()

  const clientNum = client?.client_number || clientId.slice(0, 8)
  const mandateReference = generateMandateReference('AE', clientNum)

  const { data, error } = await supabase
    .from('sepa_mandates')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      mandate_reference: mandateReference,
      mandate_date: mandateDate,
      mandate_type: mandateType || 'CORE',
      sequence_type: 'FRST',
      debtor_name: debtorName,
      debtor_iban: cleanIban,
      debtor_bic: debtorBic || null,
      status: 'aktiv',
      created_by: actorId,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`Mandat konnte nicht erstellt werden: ${error?.message}`)

  await logBillingAction(supabase, {
    entityType: 'sepa_mandate',
    organizationId,
    entityId: data.id,
    action: 'created',
    newState: { mandate_reference: mandateReference, debtor_name: debtorName, debtor_iban: cleanIban },
    actorId,
  })

  return data
}

// ---------------------------------------------------------------------------
// listMandates — Mandate eines Mandanten auflisten
// ---------------------------------------------------------------------------

export async function listMandates(
  supabase: SupabaseClient,
  organizationId: string,
  filters?: { clientId?: string; status?: MandateStatus }
) {
  let query = supabase
    .from('sepa_mandates')
    .select('*, client:clients(first_name, last_name, client_number)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (filters?.clientId) query = query.eq('client_id', filters.clientId)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw new Error(`Mandate konnten nicht geladen werden: ${error.message}`)
  return data || []
}

// ---------------------------------------------------------------------------
// revokeMandate — Mandat widerrufen
// ---------------------------------------------------------------------------

export async function revokeMandate(
  supabase: SupabaseClient,
  mandateId: string,
  reason: string,
  actorId: string,
  expectedOrgId?: string
) {
  let query = supabase
    .from('sepa_mandates')
    .update({
      status: 'widerrufen',
      revoked_at: new Date().toISOString(),
      revoke_reason: reason,
    })
    .eq('id', mandateId)
    .eq('status', 'aktiv')

  if (expectedOrgId) query = query.eq('organization_id', expectedOrgId)

  const { data, error } = await query
    .select('id, organization_id, mandate_reference')
    .single()

  if (error || !data) throw new Error(`Mandat konnte nicht widerrufen werden: ${error?.message}`)

  await logBillingAction(supabase, {
    entityType: 'sepa_mandate',
    organizationId: data.organization_id,
    entityId: mandateId,
    action: 'revoked',
    newState: { reason },
    actorId,
  })

  return data
}

// ---------------------------------------------------------------------------
// createSepaBatch — SEPA-Sammelauftrag aus offenen Privatrechnungen
// ---------------------------------------------------------------------------

export async function createSepaBatch(
  supabase: SupabaseClient,
  params: CreateBatchParams
) {
  const { organizationId, invoiceIds, requestedCollectionDate, actorId } = params

  if (invoiceIds.length === 0) throw new Error('Mindestens eine Rechnung auswählen.')

  // Org-Daten (Gläubiger) laden
  const { data: org } = await supabase
    .from('organizations')
    .select('name, iban, bic, bank_name, sepa_creditor_id')
    .eq('id', organizationId)
    .single()

  if (!org?.iban) throw new Error('Organisation hat keine IBAN hinterlegt.')

  // Fail-closed: ein Platzhalter (z. B. der Migrations-Default) ist nicht leer
  // und rutschte durch eine reine Null-Prüfung hindurch. Siehe glaeubiger-id.ts.
  const glaeubigerId = pruefeGlaeubigerIdOderWerfe(org.sepa_creditor_id)

  // Rechnungen mit Client + Mandat laden
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, total_amount, paid_amount, client_id, status')
    .in('id', invoiceIds)
    .eq('organization_id', organizationId)

  if (!invoices || invoices.length === 0) throw new Error('Keine gültigen Rechnungen gefunden.')

  // Für jeden Client das aktive Mandat laden
  const clientIds = [...new Set(invoices.map(i => i.client_id))]
  const { data: mandates } = await supabase
    .from('sepa_mandates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'aktiv')
    .in('client_id', clientIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mandateByClient = new Map<string, any>()
  for (const m of mandates || []) {
    mandateByClient.set(m.client_id, m)
  }

  // Batch-Nummer generieren
  const batchNumber = `SEPA-${heuteBerlin().replace(/-/g, '')}-${Date.now().toString(36).toUpperCase()}`

  // Batch erstellen
  const items: { invoiceId: string; mandateId: string; amountCents: number; endToEndId: string; item: SepaDirectDebitItem }[] = []
  const skipped: { invoiceId: string; reason: string }[] = []

  for (const inv of invoices) {
    const mandate = mandateByClient.get(inv.client_id)
    if (!mandate) {
      skipped.push({ invoiceId: inv.id, reason: 'Kein aktives SEPA-Mandat' })
      continue
    }

    const totalCents = Math.round(Number(inv.total_amount || 0) * 100)
    const paidCents = Math.round(Number(inv.paid_amount || 0) * 100)
    const openCents = totalCents - paidCents
    if (openCents <= 0) {
      skipped.push({ invoiceId: inv.id, reason: 'Rechnung bereits bezahlt' })
      continue
    }

    const invNum = inv.invoice_number_formatted || inv.invoice_number || inv.id.slice(0, 8)
    const endToEndId = `AE-${invNum}`.replace(/[^A-Za-z0-9\-]/g, '').slice(0, 35)

    items.push({
      invoiceId: inv.id,
      mandateId: mandate.id,
      amountCents: openCents,
      endToEndId,
      item: {
        endToEndId,
        amountCents: openCents,
        mandateId: mandate.mandate_reference,
        mandateDate: mandate.mandate_date,
        sequenceType: mandate.sequence_type as 'FRST' | 'RCUR' | 'OOFF' | 'FNAL',
        debtorName: mandate.debtor_name,
        debtorIban: mandate.debtor_iban,
        debtorBic: mandate.debtor_bic || undefined,
        remittanceInfo: `Rechnung ${invNum}`,
      },
    })
  }

  if (items.length === 0) {
    throw new Error(`Keine einziehbaren Rechnungen. Übersprungen: ${skipped.map(s => s.reason).join(', ')}`)
  }

  const totalCents = items.reduce((s, i) => s + i.amountCents, 0)

  // pain.008 XML generieren
  const xmlContent = generatePain008({
    messageId: batchNumber,
    requestedCollectionDate,
    creditor: {
      name: org.name || 'Alltagsengel UG',
      iban: org.iban,
      bic: org.bic || undefined,
      creditorId: glaeubigerId,
    },
    items: items.map(i => i.item),
  })

  // Batch in DB speichern
  const { data: batch, error: batchErr } = await supabase
    .from('sepa_batches')
    .insert({
      organization_id: organizationId,
      batch_number: batchNumber,
      batch_date: heuteBerlin(),
      total_items: items.length,
      total_cents: totalCents,
      status: 'erstellt',
      requested_collection_date: requestedCollectionDate,
      created_by: actorId,
    })
    .select('id')
    .single()

  if (batchErr || !batch) throw new Error(`Batch konnte nicht erstellt werden: ${batchErr?.message}`)

  // Batch-Items speichern
  const batchItems = items.map(i => ({
    organization_id: organizationId,
    batch_id: batch.id,
    invoice_id: i.invoiceId,
    mandate_id: i.mandateId,
    amount_cents: i.amountCents,
    end_to_end_id: i.endToEndId,
    status: 'offen',
  }))

  const { error: itemsErr } = await supabase
    .from('sepa_batch_items')
    .insert(batchItems)

  if (itemsErr) throw new Error(`Batch-Positionen konnten nicht gespeichert werden: ${itemsErr.message}`)

  // XML in Supabase Storage speichern
  const storagePath = `sepa/${organizationId}/${batchNumber}.xml`
  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(storagePath, new Blob([xmlContent], { type: 'application/xml' }), { upsert: true })

  if (!uploadErr) {
    await supabase.from('sepa_batches').update({ xml_storage_path: storagePath }).eq('id', batch.id)
  }

  // Mandate auf RCUR setzen (nach erstem Einzug)
  for (const i of items) {
    const mandate = mandateByClient.get(invoices.find(inv => inv.id === i.invoiceId)!.client_id)
    if (mandate && mandate.sequence_type === 'FRST') {
      await supabase
        .from('sepa_mandates')
        .update({ sequence_type: 'RCUR', last_used_at: new Date().toISOString() })
        .eq('id', mandate.id)
    } else if (mandate) {
      await supabase
        .from('sepa_mandates')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', mandate.id)
    }
  }

  await logBillingAction(supabase, {
    entityType: 'sepa_batch',
    organizationId,
    entityId: batch.id,
    action: 'created',
    newState: { batch_number: batchNumber, total_items: items.length, total_cents: totalCents },
    actorId,
  })

  return {
    batchId: batch.id,
    batchNumber,
    totalItems: items.length,
    totalCents,
    skipped,
    xmlContent,
  }
}

// ---------------------------------------------------------------------------
// listBatches — SEPA-Batches auflisten
// ---------------------------------------------------------------------------

export async function listBatches(
  supabase: SupabaseClient,
  organizationId: string
) {
  const { data, error } = await supabase
    .from('sepa_batches')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Batches konnten nicht geladen werden: ${error.message}`)
  return data || []
}
