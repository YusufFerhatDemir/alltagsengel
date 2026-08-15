import type { SupabaseClient } from '@supabase/supabase-js'
import { generateCiiXml } from './cii-generator'
import { BRIEFKOPF } from '@/lib/pdf/briefkopf'
import { getOrgIK } from '@/lib/config/org-config'
import type { XRechnungData, XRechnungLineItem, InvoiceTypeCode } from './types'

function typeCodeFromCorrectionType(correctionType: string | null): InvoiceTypeCode {
  switch (correctionType) {
    case 'gutschrift': return '381'
    case 'korrektur': return '384'
    case 'storno': return '381'
    default: return '380'
  }
}

function unitCodeFromMinutes(minutes: number | null): string {
  if (!minutes) return 'C62'
  return 'HUR'
}

function quantityFromItem(item: { duration_minutes: number | null }): number {
  if (item.duration_minutes) return item.duration_minutes / 60
  return 1
}

interface InvoiceRow {
  id: string
  invoice_number: string | null
  invoice_number_formatted: string | null
  client_id: string
  period_start: string
  period_end: string
  total_amount: number
  status: string
  correction_of: string | null
  correction_type: string | null
  due_date: string | null
  payment_terms_days: number | null
  organization_id: string
  created_at: string
}

interface ClientRow {
  first_name: string | null
  last_name: string | null
  address: string | null
  city: string | null
  zip_code: string | null
  insurance_name: string | null
  insurance_number: string | null
}

interface OrgRow {
  name: string | null
  iban: string | null
  bic: string | null
  bank_name: string | null
  settings: { steuernummer?: string; leitweg_id?: string } | null
}

interface ItemRow {
  id: string
  description: string | null
  date: string
  duration_minutes: number | null
  amount: number
  budget_type: string | null
  tariff_preis_cent: number | null
}

export async function loadInvoiceXRechnungData(
  supabase: SupabaseClient,
  invoiceId: string,
  orgId: string,
): Promise<XRechnungData> {
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, client_id, period_start, period_end, total_amount, status, correction_of, correction_type, due_date, payment_terms_days, organization_id, created_at')
    .eq('id', invoiceId)
    .eq('organization_id', orgId)
    .single()

  if (invErr || !invoice) throw new Error('Rechnung nicht gefunden.')
  const inv = invoice as InvoiceRow

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('first_name, last_name, address, city, zip_code, insurance_name, insurance_number')
    .eq('id', inv.client_id)
    .single()

  if (clientErr || !client) throw new Error('Klient nicht gefunden.')
  const cl = client as ClientRow

  const { data: orgData } = await supabase
    .from('organizations')
    .select('name, iban, bic, bank_name, settings')
    .eq('id', orgId)
    .maybeSingle()
  const org = (orgData || {}) as Partial<OrgRow>
  const settings = (org.settings || {}) as { steuernummer?: string; leitweg_id?: string }

  const ikNummer = await getOrgIK(supabase, orgId).catch(() => null)

  const { data: items } = await supabase
    .from('invoice_items')
    .select('id, description, date, duration_minutes, amount, budget_type, tariff_preis_cent')
    .eq('invoice_id', invoiceId)
    .order('date')
  const invoiceItems = (items || []) as ItemRow[]

  let correctionOfNumber: string | null = null
  if (inv.correction_of) {
    const { data: origInv } = await supabase
      .from('invoices')
      .select('invoice_number_formatted, invoice_number')
      .eq('id', inv.correction_of)
      .maybeSingle()
    correctionOfNumber = origInv?.invoice_number_formatted || origInv?.invoice_number || null
  }

  const invoiceNumber = inv.invoice_number_formatted || inv.invoice_number || inv.id
  const clientName = [cl.first_name, cl.last_name].filter(Boolean).join(' ') || 'Unbekannt'
  const buyerName = cl.insurance_name || clientName

  const lineItems: XRechnungLineItem[] = invoiceItems.map((item, idx) => {
    const qty = quantityFromItem(item)
    const lineTotalCents = Math.round(Number(item.amount) * 100)
    const unitPriceCents = item.tariff_preis_cent ?? (qty > 0 ? Math.round(lineTotalCents / qty) : lineTotalCents)

    return {
      lineId: idx + 1,
      description: item.description || 'Alltagsbegleitung',
      quantity: qty,
      unitCode: unitCodeFromMinutes(item.duration_minutes),
      unitPriceCents,
      lineTotalCents,
      leistungsdatum: item.date,
    }
  })

  const totalAmountCents = Math.round(Number(inv.total_amount) * 100)

  const issueDate = inv.created_at ? inv.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)

  return {
    invoiceNumber,
    typeCode: typeCodeFromCorrectionType(inv.correction_type),
    issueDate,
    periodStart: inv.period_start,
    periodEnd: inv.period_end,
    seller: {
      name: BRIEFKOPF.firma,
      street: BRIEFKOPF.strasse,
      city: 'Frankfurt am Main',
      zip: '60311',
      country: 'DE',
      taxId: settings.steuernummer || null,
      ikNummer,
      email: BRIEFKOPF.email,
      registrationName: BRIEFKOPF.firma,
      registrationId: BRIEFKOPF.registernummer,
    },
    buyer: {
      name: buyerName,
      street: cl.address,
      city: cl.city,
      zip: cl.zip_code,
      country: 'DE',
      insuranceNumber: cl.insurance_number,
      leitwegId: settings.leitweg_id || null,
    },
    payment: {
      iban: org.iban || null,
      bic: org.bic || null,
      bankName: org.bank_name || null,
      paymentTermsDays: inv.payment_terms_days,
    },
    dueDate: inv.due_date,
    lineItems,
    totalAmountCents,
    correctionOfNumber,
  }
}

export async function generateXRechnungXml(
  supabase: SupabaseClient,
  invoiceId: string,
  orgId: string,
): Promise<string> {
  const data = await loadInvoiceXRechnungData(supabase, invoiceId, orgId)
  return generateCiiXml(data, 'xrechnung')
}

export async function generateZugferdXml(
  supabase: SupabaseClient,
  invoiceId: string,
  orgId: string,
): Promise<string> {
  const data = await loadInvoiceXRechnungData(supabase, invoiceId, orgId)
  return generateCiiXml(data, 'zugferd')
}
