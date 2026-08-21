// ═══════════════════════════════════════════════════════════════
// Mahnungs-PDF Generator — erzeugt kassenfähige Mahnschreiben
// Nutzt DejaVuSans für korrekte Umlaute/türkische Zeichen
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { DUNNING_LABELS, DUNNING_FEES_CENTS, type DunningLevel } from '../core/dunning'
import { logBillingAction } from '../core/audit'
import { berlinParts, datumBerlin, heuteBerlin } from '@/lib/utils/timezone';

/**
 * Absender-Rückfall, falls die Organisation keine Anschrift gepflegt hat.
 * Bewusst als lokale Konstante statt Import aus lib/pdf/briefkopf — dort
 * hängt pdf-lib mit dran, das dieses Modul nicht braucht.
 * Quelle: app/impressum/page.tsx.
 */
/** Typ fuer client-Join-Ergebnis aus Supabase-Abfragen. */
type ClientJoin = { first_name?: string; last_name?: string; email?: string } | null

const ABSENDER_FALLBACK = {
  firma: 'Alltagsengel UG (haftungsbeschränkt)',
  strasse: 'Neue Mainzer Straße 66-68',
  ort: '60311 Frankfurt am Main',
  email: 'info@alltagsengel.care',
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MahnungData {
  // Gläubiger
  creditorName: string
  creditorAddress: string[]
  creditorPhone?: string
  creditorEmail?: string
  creditorIban?: string
  creditorBic?: string

  // Schuldner
  debtorName: string
  debtorAddress: string[]

  // Rechnung
  invoiceNumber: string
  invoiceDate: string
  invoiceAmount: string      // formatiert, z.B. "105,00 €"
  paidAmount: string
  openAmount: string
  dueDate: string

  // Mahnung
  dunningLevel: DunningLevel
  dunningFee: string         // formatiert
  totalDue: string           // Offen + Mahngebühr
  paymentDeadline: string    // Zahlungsfrist
  previousDunningDate?: string

  // Meta
  date: string               // Briefdatum
  referenceNumber: string    // Aktenzeichen
}

// ---------------------------------------------------------------------------
// Mahnung-Text pro Stufe
// ---------------------------------------------------------------------------

const DUNNING_TEXTS: Record<string, { subject: string; body: string; closing: string }> = {
  erinnerung: {
    subject: 'Zahlungserinnerung',
    body: `bei der Überprüfung unserer Konten haben wir festgestellt, dass die nachstehende Rechnung noch nicht beglichen wurde. Möglicherweise handelt es sich um ein Versehen.\n\nWir bitten Sie freundlich, den ausstehenden Betrag bis zum {deadline} auf unser unten genanntes Konto zu überweisen.\n\nSollte sich Ihre Zahlung mit diesem Schreiben gekreuzt haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.`,
    closing: 'Mit freundlichen Grüßen',
  },
  mahnung_1: {
    subject: '1. Mahnung',
    body: `leider konnten wir trotz unserer Zahlungserinnerung noch keinen Zahlungseingang für die nachstehende Rechnung verbuchen.\n\nWir bitten Sie dringend, den fälligen Betrag zuzüglich der angefallenen Mahngebühren bis zum {deadline} zu begleichen.\n\nBei Fragen zur Rechnung stehen wir Ihnen gerne zur Verfügung.`,
    closing: 'Mit freundlichen Grüßen',
  },
  mahnung_2: {
    subject: '2. Mahnung',
    body: `trotz unserer bisherigen Zahlungsaufforderungen ist die nachstehende Forderung weiterhin offen.\n\nWir fordern Sie hiermit nachdrücklich auf, den Gesamtbetrag einschließlich aller Mahngebühren bis spätestens {deadline} zu überweisen.\n\nSollte bis zu diesem Datum kein Zahlungseingang erfolgen, sehen wir uns gezwungen, weitere Schritte einzuleiten.`,
    closing: 'Mit freundlichen Grüßen',
  },
  letzte_mahnung: {
    subject: 'Letzte Mahnung vor gerichtlichem Mahnverfahren',
    body: `trotz wiederholter Aufforderungen ist die nachstehende Forderung nach wie vor nicht beglichen.\n\nDies ist unsere letzte außergerichtliche Mahnung. Wir fordern Sie auf, den Gesamtbetrag bis spätestens {deadline} zu überweisen.\n\nSollte bis zu diesem Datum kein Zahlungseingang erfolgen, werden wir ohne weitere Ankündigung ein gerichtliches Mahnverfahren einleiten bzw. die Forderung an ein Inkassobüro übergeben. Die dadurch entstehenden zusätzlichen Kosten gehen zu Ihren Lasten.`,
    closing: 'Hochachtungsvoll',
  },
}

// ---------------------------------------------------------------------------
// formatDate — deutsches Datumsformat
// ---------------------------------------------------------------------------
function formatDateDE(iso: string): string {
  const p = berlinParts(new Date(iso))
  return `${p.day}.${p.month}.${p.year}`
}

// ---------------------------------------------------------------------------
// formatCurrency — Euro-Format
// ---------------------------------------------------------------------------
function formatCurrency(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

// ---------------------------------------------------------------------------
// generateMahnungHtml — HTML für serverseitige PDF-Generierung
// ---------------------------------------------------------------------------
export function generateMahnungHtml(data: MahnungData): string {
  const template = DUNNING_TEXTS[data.dunningLevel]
  if (!template) throw new Error(`Kein Mahnungstext für Stufe "${data.dunningLevel}"`)

  const bodyText = template.body.replace(/{deadline}/g, formatDateDE(data.paymentDeadline))

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm 25mm 25mm 25mm; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #c8a84e; padding-bottom: 15px; }
  .header-left { font-weight: bold; font-size: 14pt; color: #1a365d; }
  .header-right { text-align: right; font-size: 9pt; color: #666; }
  .absender-zeile { font-size: 8pt; color: #999; margin-bottom: 5px; text-decoration: underline; }
  .empfaenger { margin-bottom: 30px; }
  .datum-block { text-align: right; margin-bottom: 20px; color: #666; font-size: 10pt; }
  .betreff { font-weight: bold; font-size: 13pt; margin-bottom: 20px; color: #1a365d; }
  .anrede { margin-bottom: 15px; }
  .text { margin-bottom: 20px; white-space: pre-line; }
  .tabelle { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .tabelle th { text-align: left; padding: 8px 12px; background: #f5f0e0; border-bottom: 2px solid #c8a84e; font-size: 10pt; }
  .tabelle td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 10pt; }
  .tabelle .betrag { text-align: right; font-variant-numeric: tabular-nums; }
  .summe { font-weight: bold; background: #faf6e9; }
  .bankdaten { background: #f8f8f8; padding: 15px; border-radius: 5px; margin: 20px 0; font-size: 10pt; }
  .bankdaten strong { display: inline-block; width: 180px; }
  .hinweis { font-size: 9pt; color: #888; margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; }
  .gruss { margin-top: 30px; }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">${escHtml(data.creditorName)}</div>
  <div class="header-right">
    ${data.creditorAddress.map(l => escHtml(l)).join('<br>')}
    ${data.creditorPhone ? `<br>Tel: ${escHtml(data.creditorPhone)}` : ''}
    ${data.creditorEmail ? `<br>${escHtml(data.creditorEmail)}` : ''}
  </div>
</div>

<div class="absender-zeile">${escHtml(data.creditorName)} · ${escHtml(data.creditorAddress[0] || '')}</div>

<div class="empfaenger">
  ${data.debtorAddress.map(l => escHtml(l)).join('<br>')}
</div>

<div class="datum-block">
  ${escHtml(data.creditorAddress[data.creditorAddress.length - 1] || '')}, den ${formatDateDE(data.date)}<br>
  Aktenzeichen: ${escHtml(data.referenceNumber)}
</div>

<div class="betreff">${escHtml(template.subject)} — Rechnung Nr. ${escHtml(data.invoiceNumber)}</div>

<div class="anrede">Sehr geehrte Damen und Herren,</div>

<div class="text">${escHtml(bodyText)}</div>

<table class="tabelle">
  <thead>
    <tr><th>Position</th><th class="betrag">Betrag</th></tr>
  </thead>
  <tbody>
    <tr><td>Rechnungsbetrag (Rechnung Nr. ${escHtml(data.invoiceNumber)} vom ${formatDateDE(data.invoiceDate)})</td><td class="betrag">${escHtml(data.invoiceAmount)}</td></tr>
    <tr><td>Bereits gezahlt</td><td class="betrag">- ${escHtml(data.paidAmount)}</td></tr>
    <tr><td>Offener Betrag</td><td class="betrag">${escHtml(data.openAmount)}</td></tr>
    ${data.dunningFee !== '0,00 €' ? `<tr><td>Mahngebühr (${escHtml(DUNNING_LABELS[data.dunningLevel])})</td><td class="betrag">${escHtml(data.dunningFee)}</td></tr>` : ''}
    <tr class="summe"><td>Gesamtforderung</td><td class="betrag">${escHtml(data.totalDue)}</td></tr>
  </tbody>
</table>

<div class="bankdaten">
  <strong>Zahlungsfrist:</strong> ${formatDateDE(data.paymentDeadline)}<br>
  <strong>Empfänger:</strong> ${escHtml(data.creditorName)}<br>
  ${data.creditorIban ? `<strong>IBAN:</strong> ${escHtml(formatIbanDisplay(data.creditorIban))}<br>` : ''}
  ${data.creditorBic ? `<strong>BIC:</strong> ${escHtml(data.creditorBic)}<br>` : ''}
  <strong>Verwendungszweck:</strong> ${escHtml(data.referenceNumber)}
</div>

<div class="gruss">
  ${escHtml(template.closing)}<br><br>
  ${escHtml(data.creditorName)}
</div>

<div class="hinweis">
  Sollte die Zahlung bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.
  Bei Rückfragen wenden Sie sich bitte unter Angabe des Aktenzeichens an uns.
</div>

</body>
</html>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatIbanDisplay(iban: string): string {
  const clean = iban.replace(/\s+/g, '')
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

// ---------------------------------------------------------------------------
// createMahnungDocument — Mahnung in DB speichern + HTML liefern
// ---------------------------------------------------------------------------

export async function createMahnungDocument(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    invoiceId: string
    dunningEntryId: string
    dunningLevel: DunningLevel
    actorId: string
  }
) {
  const { organizationId, invoiceId, dunningEntryId, dunningLevel, actorId } = params

  // Org-Daten laden.
  // LIVE-SCHEMA: organizations hat KEINE Spalten street/zip/city/phone/email.
  // Die Anschrift steckt im JSONB `address` ({strasse, plz, ort, bundesland}),
  // Telefon und E-Mail gibt es dort gar nicht — die stehen im Briefkopf.
  // Ein Select auf die alten Spaltennamen scheiterte mit 42703, `org` war
  // null und die Mahnung brach mit „Organisation nicht gefunden" ab.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('name, address, iban, bic')
    .eq('id', organizationId)
    .single()

  if (orgErr) throw new Error(`Organisation nicht lesbar: ${orgErr.message}`)
  if (!org) throw new Error('Organisation nicht gefunden')

  const orgAdresse = (org.address ?? {}) as { strasse?: string; plz?: string; ort?: string }

  // Rechnung + Client laden.
  // invoices hat kein invoice_date (created_at ist das Belegdatum), und
  // clients heißen die Adressfelder address/zip_code/city.
  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, created_at, total_amount, paid_amount, due_date, client:clients(first_name, last_name, address, zip_code, city)')
    .eq('id', invoiceId)
    .single()

  if (invErr) throw new Error(`Rechnung ${invoiceId} nicht lesbar: ${invErr.message}`)
  if (!inv) throw new Error(`Rechnung ${invoiceId} nicht gefunden`)

  // Dunning-Entry laden
  const { data: entry } = await supabase
    .from('dunning_entries')
    .select('dunning_fee_cents')
    .eq('id', dunningEntryId)
    .single()

  const totalCents = Math.round(Number(inv.total_amount || 0) * 100)
  const paidCents = Math.round(Number(inv.paid_amount || 0) * 100)
  const openCents = totalCents - paidCents
  const feeCents = entry?.dunning_fee_cents || DUNNING_FEES_CENTS[dunningLevel] || 0
  const totalDueCents = openCents + feeCents

  // Zahlungsfrist: 14 Tage ab heute (Berlin-Kalender)
  const heuteIso = heuteBerlin()
  const deadlineDate = new Date(heuteIso + 'T12:00:00+01:00')
  deadlineDate.setDate(deadlineDate.getDate() + 14)
  const deadlineStr = datumBerlin(deadlineDate)

  const client = inv.client as unknown as ClientJoin
  const invNum = inv.invoice_number_formatted || inv.invoice_number || ''

  const mahnungData: MahnungData = {
    creditorName: org.name || ABSENDER_FALLBACK.firma,
    creditorAddress: [
      orgAdresse.strasse || ABSENDER_FALLBACK.strasse,
      `${orgAdresse.plz || ''} ${orgAdresse.ort || ''}`.trim() || ABSENDER_FALLBACK.ort,
    ],
    creditorPhone: undefined,
    creditorEmail: ABSENDER_FALLBACK.email,
    creditorIban: org.iban || undefined,
    creditorBic: org.bic || undefined,

    debtorName: `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
    debtorAddress: [
      `${client?.first_name || ''} ${client?.last_name || ''}`.trim(),
      client?.address || '',
      `${client?.zip_code || ''} ${client?.city || ''}`.trim(),
    ].filter(Boolean),

    invoiceNumber: invNum,
    // Belegdatum = Anlagezeitpunkt der Rechnung (invoices.created_at).
    invoiceDate: typeof inv.created_at === 'string' ? inv.created_at.slice(0, 10) : '',
    invoiceAmount: formatCurrency(totalCents),
    paidAmount: formatCurrency(paidCents),
    openAmount: formatCurrency(openCents),
    dueDate: inv.due_date || '',

    dunningLevel,
    dunningFee: formatCurrency(feeCents),
    totalDue: formatCurrency(totalDueCents),
    paymentDeadline: deadlineStr,

    date: heuteBerlin(),
    referenceNumber: `M-${invNum}-${dunningLevel.toUpperCase()}`,
  }

  const html = generateMahnungHtml(mahnungData)

  // Dokument in DB speichern
  const { data: doc, error } = await supabase
    .from('dunning_documents')
    .insert({
      organization_id: organizationId,
      dunning_entry_id: dunningEntryId,
      invoice_id: invoiceId,
      dunning_level: dunningLevel,
      zahlungsfrist: deadlineStr,
      created_by: actorId,
    })
    .select('id')
    .single()

  if (error || !doc) throw new Error(`Mahnungsdokument konnte nicht gespeichert werden: ${error?.message}`)

  await logBillingAction(supabase, {
    entityType: 'dunning_document',
    organizationId,
    entityId: doc.id,
    action: 'created',
    newState: { dunning_level: dunningLevel, invoice_number: invNum, total_due_cents: totalDueCents },
    actorId,
  })

  return {
    documentId: doc.id,
    html,
    mahnungData,
    paymentDeadline: deadlineStr,
  }
}

// ---------------------------------------------------------------------------
// generateMahnungEmail — E-Mail-Inhalt für Mahnung
// ---------------------------------------------------------------------------

export function generateMahnungEmail(data: MahnungData): { subject: string; body: string } {
  const template = DUNNING_TEXTS[data.dunningLevel]
  if (!template) throw new Error(`Kein Mahnungstext für Stufe "${data.dunningLevel}"`)

  const subject = `${template.subject} — Rechnung Nr. ${data.invoiceNumber}`

  const bodyText = template.body.replace(/{deadline}/g, formatDateDE(data.paymentDeadline))

  const body = `Sehr geehrte Damen und Herren,

${bodyText}

Rechnungsnummer: ${data.invoiceNumber}
Rechnungsdatum: ${formatDateDE(data.invoiceDate)}
Offener Betrag: ${data.openAmount}
${data.dunningFee !== '0,00 €' ? `Mahngebühr: ${data.dunningFee}\n` : ''}Gesamtforderung: ${data.totalDue}

Zahlungsfrist: ${formatDateDE(data.paymentDeadline)}
Empfänger: ${data.creditorName}
${data.creditorIban ? `IBAN: ${formatIbanDisplay(data.creditorIban)}` : ''}
Verwendungszweck: ${data.referenceNumber}

${template.closing}

${data.creditorName}

---
Sollte die Zahlung bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos.`

  return { subject, body }
}
