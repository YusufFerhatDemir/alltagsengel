// ═══════════════════════════════════════════════════════════════
// SEPA pain.008.001.02 — Direct Debit XML Generator
// Erzeugt ISO 20022 XML für SEPA-Basislastschrift (CORE)
// ═══════════════════════════════════════════════════════════════

import { pruefeGlaeubigerIdOderWerfe } from './glaeubiger-id'

export interface SepaCreditor {
  name: string          // Gläubiger-Name (max 70 Zeichen)
  iban: string          // Gläubiger-IBAN
  bic?: string          // Gläubiger-BIC (optional ab 2016)
  creditorId: string    // Gläubiger-Identifikationsnummer (CI)
}

export interface SepaDirectDebitItem {
  endToEndId: string           // Eindeutige Transaktions-ID (max 35 Zeichen)
  amountCents: number          // Betrag in Cent
  mandateId: string            // Mandatsreferenz
  mandateDate: string          // Mandatsdatum (YYYY-MM-DD)
  sequenceType: 'FRST' | 'RCUR' | 'OOFF' | 'FNAL'
  debtorName: string           // Zahlungspflichtiger Name
  debtorIban: string           // Zahlungspflichtiger IBAN
  debtorBic?: string           // Zahlungspflichtiger BIC (optional)
  remittanceInfo?: string      // Verwendungszweck (max 140 Zeichen)
}

export interface SepaPain008Options {
  messageId: string            // Eindeutige Nachrichten-ID (max 35 Zeichen)
  creationDateTime?: string    // ISO datetime, default: now
  requestedCollectionDate: string  // Gewünschtes Einzugsdatum (YYYY-MM-DD)
  creditor: SepaCreditor
  items: SepaDirectDebitItem[]
}

// ---------------------------------------------------------------------------
// XML-Escaping
// ---------------------------------------------------------------------------
function xmlEsc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

// ---------------------------------------------------------------------------
// SEPA pain.008.001.02 generieren
// ---------------------------------------------------------------------------
export function generatePain008(options: SepaPain008Options): string {
  const {
    messageId,
    creationDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    requestedCollectionDate,
    creditor,
    items,
  } = options

  if (items.length === 0) {
    throw new Error('Mindestens eine Lastschrift-Position erforderlich.')
  }

  // Letzte Sperre gegen Platzhalter-Gläubiger-IDs. Sie sitzt bewusst hier und
  // nicht nur im aufrufenden Service: dies ist die einzige Stelle, an der ein
  // einziehbares pain.008 entsteht. Jeder künftige Aufrufer läuft dagegen.
  pruefeGlaeubigerIdOderWerfe(creditor.creditorId)

  const totalCents = items.reduce((sum, i) => sum + i.amountCents, 0)
  const numberOfTransactions = items.length

  // Gruppiere nach SequenceType (FRST, RCUR, etc.)
  const groups = new Map<string, SepaDirectDebitItem[]>()
  for (const item of items) {
    const key = item.sequenceType
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const creditorIban = normalizeIban(creditor.iban)

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${xmlEsc(truncate(messageId, 35))}</MsgId>
      <CreDtTm>${creationDateTime}</CreDtTm>
      <NbOfTxs>${numberOfTransactions}</NbOfTxs>
      <CtrlSum>${formatAmount(totalCents)}</CtrlSum>
      <InitgPty>
        <Nm>${xmlEsc(truncate(creditor.name, 70))}</Nm>
      </InitgPty>
    </GrpHdr>`

  for (const [seqType, groupItems] of groups) {
    const groupTotal = groupItems.reduce((s, i) => s + i.amountCents, 0)

    xml += `
    <PmtInf>
      <PmtInfId>${xmlEsc(truncate(`${messageId}-${seqType}`, 35))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>${groupItems.length}</NbOfTxs>
      <CtrlSum>${formatAmount(groupTotal)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <LclInstrm><Cd>CORE</Cd></LclInstrm>
        <SeqTp>${seqType}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${requestedCollectionDate}</ReqdColltnDt>
      <Cdtr>
        <Nm>${xmlEsc(truncate(creditor.name, 70))}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id><IBAN>${creditorIban}</IBAN></Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>${creditor.bic ? `<BIC>${xmlEsc(creditor.bic)}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}</FinInstnId>
      </CdtrAgt>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${xmlEsc(creditor.creditorId)}</Id>
              <SchmeNm><Prtry>SEPA</Prtry></SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>`

    for (const item of groupItems) {
      const debtorIban = normalizeIban(item.debtorIban)

      xml += `
      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${xmlEsc(truncate(item.endToEndId, 35))}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${formatAmount(item.amountCents)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${xmlEsc(truncate(item.mandateId, 35))}</MndtId>
            <DtOfSgntr>${item.mandateDate}</DtOfSgntr>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>${item.debtorBic ? `<BIC>${xmlEsc(item.debtorBic)}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}</FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>${xmlEsc(truncate(item.debtorName, 70))}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id><IBAN>${debtorIban}</IBAN></Id>
        </DbtrAcct>${item.remittanceInfo ? `
        <RmtInf>
          <Ustrd>${xmlEsc(truncate(item.remittanceInfo, 140))}</Ustrd>
        </RmtInf>` : ''}</DrctDbtTxInf>`
    }

    xml += `
    </PmtInf>`
  }

  xml += `
  </CstmrDrctDbtInitn>
</Document>`

  return xml
}

// ---------------------------------------------------------------------------
// IBAN-Validierung (Prüfsumme MOD 97)
// ---------------------------------------------------------------------------
export function validateIban(iban: string): boolean {
  const clean = normalizeIban(iban)
  if (clean.length < 15 || clean.length > 34) return false
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) return false

  // ISO 13616: Ersten 4 Zeichen ans Ende, Buchstaben → Ziffern (A=10..Z=35)
  const rearranged = clean.slice(4) + clean.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55))

  // Mod 97 auf großer Zahl (chunk-weise)
  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    const chunk = String(remainder) + numeric.slice(i, i + 7)
    remainder = parseInt(chunk, 10) % 97
  }

  return remainder === 1
}

// ---------------------------------------------------------------------------
// Mandatsreferenz generieren
// ---------------------------------------------------------------------------
export function generateMandateReference(orgPrefix: string, clientNumber: string): string {
  const ts = Date.now().toString(36).toUpperCase()
  return truncate(`${orgPrefix}-${clientNumber}-${ts}`, 35)
}
