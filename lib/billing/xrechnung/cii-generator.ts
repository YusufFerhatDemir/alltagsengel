import { escapeXml, formatCiiDate, formatAmount, formatQuantity } from './xml-escape'
import type { XRechnungData } from './types'

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
} as const

const VAT_EXEMPTION_REASON = 'Steuerbefreit nach § 4 Nr. 16 UStG'
const VAT_EXEMPTION_CODE = 'vatex-eu-132-1g'

export function generateCiiXml(data: XRechnungData, profile: 'xrechnung' | 'zugferd' = 'xrechnung'): string {
  const guidelineId = profile === 'xrechnung'
    ? 'urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0'
    : 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:extended'

  const totalEuro = data.totalAmountCents / 100
  const lineTotalEuro = data.lineItems.reduce((s, li) => s + li.lineTotalCents / 100, 0)

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push(`<rsm:CrossIndustryInvoice`)
  lines.push(`  xmlns:rsm="${NS.rsm}"`)
  lines.push(`  xmlns:ram="${NS.ram}"`)
  lines.push(`  xmlns:udt="${NS.udt}"`)
  lines.push(`  xmlns:qdt="${NS.qdt}">`)

  // ── ExchangedDocumentContext ──
  lines.push('  <rsm:ExchangedDocumentContext>')
  lines.push('    <ram:GuidelineSpecifiedDocumentContextParameter>')
  lines.push(`      <ram:ID>${escapeXml(guidelineId)}</ram:ID>`)
  lines.push('    </ram:GuidelineSpecifiedDocumentContextParameter>')
  lines.push('  </rsm:ExchangedDocumentContext>')

  // ── ExchangedDocument ──
  lines.push('  <rsm:ExchangedDocument>')
  lines.push(`    <ram:ID>${escapeXml(data.invoiceNumber)}</ram:ID>`)
  lines.push(`    <ram:TypeCode>${escapeXml(data.typeCode)}</ram:TypeCode>`)
  lines.push('    <ram:IssueDateTime>')
  lines.push(`      <udt:DateTimeString format="102">${formatCiiDate(data.issueDate)}</udt:DateTimeString>`)
  lines.push('    </ram:IssueDateTime>')
  if (data.noteText) {
    lines.push(`    <ram:IncludedNote>`)
    lines.push(`      <ram:Content>${escapeXml(data.noteText)}</ram:Content>`)
    lines.push(`    </ram:IncludedNote>`)
  }
  lines.push('  </rsm:ExchangedDocument>')

  // ── SupplyChainTradeTransaction ──
  lines.push('  <rsm:SupplyChainTradeTransaction>')

  // ── Header Trade Agreement ──
  lines.push('    <ram:ApplicableHeaderTradeAgreement>')
  if (data.buyer.leitwegId) {
    lines.push(`      <ram:BuyerReference>${escapeXml(data.buyer.leitwegId)}</ram:BuyerReference>`)
  }

  // Seller
  lines.push('      <ram:SellerTradeParty>')
  lines.push(`        <ram:Name>${escapeXml(data.seller.name)}</ram:Name>`)
  if (data.seller.registrationId) {
    lines.push('        <ram:SpecifiedLegalOrganization>')
    lines.push(`          <ram:ID schemeID="0204">${escapeXml(data.seller.registrationId)}</ram:ID>`)
    if (data.seller.registrationName) {
      lines.push(`          <ram:TradingBusinessName>${escapeXml(data.seller.registrationName)}</ram:TradingBusinessName>`)
    }
    lines.push('        </ram:SpecifiedLegalOrganization>')
  }
  lines.push('        <ram:PostalTradeAddress>')
  lines.push(`          <ram:PostcodeCode>${escapeXml(data.seller.zip)}</ram:PostcodeCode>`)
  lines.push(`          <ram:LineOne>${escapeXml(data.seller.street)}</ram:LineOne>`)
  lines.push(`          <ram:CityName>${escapeXml(data.seller.city)}</ram:CityName>`)
  lines.push(`          <ram:CountryID>${escapeXml(data.seller.country)}</ram:CountryID>`)
  lines.push('        </ram:PostalTradeAddress>')
  if (data.seller.email) {
    lines.push('        <ram:URIUniversalCommunication>')
    lines.push(`          <ram:URIID schemeID="EM">${escapeXml(data.seller.email)}</ram:URIID>`)
    lines.push('        </ram:URIUniversalCommunication>')
  }
  if (data.seller.taxId) {
    lines.push('        <ram:SpecifiedTaxRegistration>')
    lines.push(`          <ram:ID schemeID="FC">${escapeXml(data.seller.taxId)}</ram:ID>`)
    lines.push('        </ram:SpecifiedTaxRegistration>')
  }
  lines.push('      </ram:SellerTradeParty>')

  // Buyer
  lines.push('      <ram:BuyerTradeParty>')
  lines.push(`        <ram:Name>${escapeXml(data.buyer.name)}</ram:Name>`)
  if (data.buyer.insuranceNumber) {
    lines.push('        <ram:SpecifiedLegalOrganization>')
    lines.push(`          <ram:ID>${escapeXml(data.buyer.insuranceNumber)}</ram:ID>`)
    lines.push('        </ram:SpecifiedLegalOrganization>')
  }
  if (data.buyer.street || data.buyer.city || data.buyer.zip) {
    lines.push('        <ram:PostalTradeAddress>')
    if (data.buyer.zip) lines.push(`          <ram:PostcodeCode>${escapeXml(data.buyer.zip)}</ram:PostcodeCode>`)
    if (data.buyer.street) lines.push(`          <ram:LineOne>${escapeXml(data.buyer.street)}</ram:LineOne>`)
    if (data.buyer.city) lines.push(`          <ram:CityName>${escapeXml(data.buyer.city)}</ram:CityName>`)
    lines.push(`          <ram:CountryID>${escapeXml(data.buyer.country || 'DE')}</ram:CountryID>`)
    lines.push('        </ram:PostalTradeAddress>')
  }
  lines.push('      </ram:BuyerTradeParty>')

  if (data.correctionOfNumber) {
    lines.push('      <ram:AdditionalReferencedDocument>')
    lines.push(`        <ram:IssuerAssignedID>${escapeXml(data.correctionOfNumber)}</ram:IssuerAssignedID>`)
    lines.push('        <ram:TypeCode>130</ram:TypeCode>')
    lines.push('      </ram:AdditionalReferencedDocument>')
  }

  lines.push('    </ram:ApplicableHeaderTradeAgreement>')

  // ── Header Trade Delivery ──
  lines.push('    <ram:ApplicableHeaderTradeDelivery>')
  lines.push('      <ram:ActualDeliverySupplyChainEvent>')
  lines.push('        <ram:OccurrenceDateTime>')
  lines.push(`          <udt:DateTimeString format="102">${formatCiiDate(data.periodEnd)}</udt:DateTimeString>`)
  lines.push('        </ram:OccurrenceDateTime>')
  lines.push('      </ram:ActualDeliverySupplyChainEvent>')
  lines.push('      <ram:BillingSpecifiedPeriod>')
  lines.push('        <ram:StartDateTime>')
  lines.push(`          <udt:DateTimeString format="102">${formatCiiDate(data.periodStart)}</udt:DateTimeString>`)
  lines.push('        </ram:StartDateTime>')
  lines.push('        <ram:EndDateTime>')
  lines.push(`          <udt:DateTimeString format="102">${formatCiiDate(data.periodEnd)}</udt:DateTimeString>`)
  lines.push('        </ram:EndDateTime>')
  lines.push('      </ram:BillingSpecifiedPeriod>')
  lines.push('    </ram:ApplicableHeaderTradeDelivery>')

  // ── Header Trade Settlement ──
  lines.push('    <ram:ApplicableHeaderTradeSettlement>')
  lines.push('      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>')

  // Payment means
  if (data.payment.iban) {
    lines.push('      <ram:SpecifiedTradeSettlementPaymentMeans>')
    lines.push('        <ram:TypeCode>58</ram:TypeCode>')
    lines.push('        <ram:PayeePartyCreditorFinancialAccount>')
    lines.push(`          <ram:IBANID>${escapeXml(data.payment.iban)}</ram:IBANID>`)
    lines.push('        </ram:PayeePartyCreditorFinancialAccount>')
    if (data.payment.bic) {
      lines.push('        <ram:PayeeSpecifiedCreditorFinancialInstitution>')
      lines.push(`          <ram:BICID>${escapeXml(data.payment.bic)}</ram:BICID>`)
      lines.push('        </ram:PayeeSpecifiedCreditorFinancialInstitution>')
    }
    lines.push('      </ram:SpecifiedTradeSettlementPaymentMeans>')
  }

  // Tax (VAT-exempt for Pflegeleistungen)
  lines.push('      <ram:ApplicableTradeTax>')
  lines.push(`        <ram:CalculatedAmount>${formatAmount(0)}</ram:CalculatedAmount>`)
  lines.push('        <ram:TypeCode>VAT</ram:TypeCode>')
  lines.push(`        <ram:ExemptionReason>${escapeXml(VAT_EXEMPTION_REASON)}</ram:ExemptionReason>`)
  lines.push(`        <ram:ExemptionReasonCode>${escapeXml(VAT_EXEMPTION_CODE)}</ram:ExemptionReasonCode>`)
  lines.push(`        <ram:BasisAmount>${formatAmount(lineTotalEuro)}</ram:BasisAmount>`)
  lines.push('        <ram:CategoryCode>E</ram:CategoryCode>')
  lines.push(`        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>`)
  lines.push('      </ram:ApplicableTradeTax>')

  // Payment terms
  if (data.dueDate) {
    lines.push('      <ram:SpecifiedTradePaymentTerms>')
    if (data.payment.paymentTermsDays) {
      lines.push(`        <ram:Description>Zahlbar innerhalb von ${data.payment.paymentTermsDays} Tagen ohne Abzug</ram:Description>`)
    }
    lines.push('        <ram:DueDateDateTime>')
    lines.push(`          <udt:DateTimeString format="102">${formatCiiDate(data.dueDate)}</udt:DateTimeString>`)
    lines.push('        </ram:DueDateDateTime>')
    lines.push('      </ram:SpecifiedTradePaymentTerms>')
  }

  // Monetary summation
  lines.push('      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>')
  lines.push(`        <ram:LineTotalAmount>${formatAmount(lineTotalEuro)}</ram:LineTotalAmount>`)
  lines.push(`        <ram:TaxBasisTotalAmount>${formatAmount(lineTotalEuro)}</ram:TaxBasisTotalAmount>`)
  lines.push(`        <ram:TaxTotalAmount currencyID="EUR">${formatAmount(0)}</ram:TaxTotalAmount>`)
  lines.push(`        <ram:GrandTotalAmount>${formatAmount(totalEuro)}</ram:GrandTotalAmount>`)
  lines.push(`        <ram:DuePayableAmount>${formatAmount(totalEuro)}</ram:DuePayableAmount>`)
  lines.push('      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>')
  lines.push('    </ram:ApplicableHeaderTradeSettlement>')

  // ── Line Items ──
  for (const item of data.lineItems) {
    const unitPriceEuro = item.unitPriceCents / 100
    const lineTotalEuro = item.lineTotalCents / 100

    lines.push('    <ram:IncludedSupplyChainTradeLineItem>')
    lines.push('      <ram:AssociatedDocumentLineDocument>')
    lines.push(`        <ram:LineID>${item.lineId}</ram:LineID>`)
    lines.push('      </ram:AssociatedDocumentLineDocument>')
    lines.push('      <ram:SpecifiedTradeProduct>')
    lines.push(`        <ram:Name>${escapeXml(item.description)}</ram:Name>`)
    lines.push('      </ram:SpecifiedTradeProduct>')
    lines.push('      <ram:SpecifiedLineTradeAgreement>')
    lines.push('        <ram:NetPriceProductTradePrice>')
    lines.push(`          <ram:ChargeAmount>${formatAmount(unitPriceEuro)}</ram:ChargeAmount>`)
    lines.push('        </ram:NetPriceProductTradePrice>')
    lines.push('      </ram:SpecifiedLineTradeAgreement>')
    lines.push('      <ram:SpecifiedLineTradeDelivery>')
    lines.push(`        <ram:BilledQuantity unitCode="${escapeXml(item.unitCode)}">${formatQuantity(item.quantity)}</ram:BilledQuantity>`)
    lines.push('      </ram:SpecifiedLineTradeDelivery>')
    lines.push('      <ram:SpecifiedLineTradeSettlement>')
    lines.push('        <ram:ApplicableTradeTax>')
    lines.push('          <ram:TypeCode>VAT</ram:TypeCode>')
    lines.push('          <ram:CategoryCode>E</ram:CategoryCode>')
    lines.push('          <ram:RateApplicablePercent>0</ram:RateApplicablePercent>')
    lines.push('        </ram:ApplicableTradeTax>')
    if (item.leistungsdatum) {
      lines.push('        <ram:BillingSpecifiedPeriod>')
      lines.push('          <ram:StartDateTime>')
      lines.push(`            <udt:DateTimeString format="102">${formatCiiDate(item.leistungsdatum)}</udt:DateTimeString>`)
      lines.push('          </ram:StartDateTime>')
      lines.push('          <ram:EndDateTime>')
      lines.push(`            <udt:DateTimeString format="102">${formatCiiDate(item.leistungsdatum)}</udt:DateTimeString>`)
      lines.push('          </ram:EndDateTime>')
      lines.push('        </ram:BillingSpecifiedPeriod>')
    }
    lines.push('        <ram:SpecifiedTradeSettlementLineMonetarySummation>')
    lines.push(`          <ram:LineTotalAmount>${formatAmount(lineTotalEuro)}</ram:LineTotalAmount>`)
    lines.push('        </ram:SpecifiedTradeSettlementLineMonetarySummation>')
    lines.push('      </ram:SpecifiedLineTradeSettlement>')
    lines.push('    </ram:IncludedSupplyChainTradeLineItem>')
  }

  lines.push('  </rsm:SupplyChainTradeTransaction>')
  lines.push('</rsm:CrossIndustryInvoice>')

  return lines.join('\n')
}
