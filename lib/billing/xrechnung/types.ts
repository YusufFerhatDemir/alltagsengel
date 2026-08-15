export interface XRechnungSeller {
  name: string
  street: string
  city: string
  zip: string
  country: string
  taxId?: string | null
  ikNummer?: string | null
  email?: string | null
  registrationName?: string | null
  registrationId?: string | null
}

export interface XRechnungBuyer {
  name: string
  street?: string | null
  city?: string | null
  zip?: string | null
  country?: string
  insuranceNumber?: string | null
  ikNummer?: string | null
  leitwegId?: string | null
}

export interface XRechnungPayment {
  iban?: string | null
  bic?: string | null
  bankName?: string | null
  paymentTermsDays?: number | null
}

export interface XRechnungLineItem {
  lineId: number
  description: string
  quantity: number
  unitCode: string
  unitPriceCents: number
  lineTotalCents: number
  leistungsdatum?: string | null
}

export type InvoiceTypeCode = '380' | '381' | '384'

export interface XRechnungData {
  invoiceNumber: string
  typeCode: InvoiceTypeCode
  issueDate: string
  periodStart: string
  periodEnd: string
  seller: XRechnungSeller
  buyer: XRechnungBuyer
  payment: XRechnungPayment
  dueDate?: string | null
  lineItems: XRechnungLineItem[]
  totalAmountCents: number
  noteText?: string | null
  correctionOfNumber?: string | null
}
