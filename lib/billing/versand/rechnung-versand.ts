// ═══════════════════════════════════════════════════════════════
// Rechnungsversand per E-Mail
// ═══════════════════════════════════════════════════════════════
//
// Schliesst Bereich 5 der Lueckenanalyse: „Die Rechnung erreicht den
// Kunden nicht. Es gibt keinen einzigen E-Mail-Versand im gesamten
// Abrechnungspfad."
//
// Ablauf: Rechnung pruefen → Belegpaket-PDF erzeugen (lib/pdf/
// rechnung-paket.ts) → E-Mail mit PDF-Anhang an die Klienten-Adresse →
// Zustellstatus schreiben.
//
// ZUSTELLSTATUS: fuehrend ist invoices.sent_at (live vorhanden). Ist es
// gesetzt, gilt die Rechnung als zugestellt und ein erneuter Aufruf
// laeuft ins Leere — ausser der Aufrufer verlangt ausdruecklich
// `erneutSenden`. Die Versuchshistorie (inkl. Fehlertext) landet
// zusaetzlich in invoice_email_log; fehlt die Tabelle (Migration
// 20260823000000 noch nicht eingespielt), wird nur gewarnt.
//
// OHNE RESEND_API_KEY wird NICHT geworfen und sent_at NICHT gesetzt:
// der Versand meldet 'uebersprungen', die Rechnung bleibt unzugestellt
// und geht beim naechsten Lauf mit gesetztem Key wieder mit.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '@/lib/billing/core/audit'
import { erzeugeRechnungsPaket } from '@/lib/pdf/rechnung-paket'
import { baueRechnungEmail } from '@/lib/emails/rechnung-email'
import { sendRawEmail } from '@/lib/notifications'
import { logger } from '@/lib/logger'

const log = logger.child('rechnung-versand')

/** Typ fuer den clients-Join. */
type ClientJoin = { first_name?: string; last_name?: string; email?: string } | null

/**
 * Status, aus denen heraus NICHT versendet werden darf.
 *
 * - entwurf / geprueft / korrektur_erforderlich: noch nicht
 *   festgeschrieben — eine solche Rechnung darf das Haus nicht verlassen
 * - storniert / abgeschrieben: gegenstandslos
 */
const NICHT_VERSANDFAEHIG: ReadonlySet<string> = new Set([
  'entwurf',
  'geprueft',
  'korrektur_erforderlich',
  'storniert',
  'abgeschrieben',
])

export type VersandStatus = 'versendet' | 'uebersprungen' | 'fehlgeschlagen'

export interface VersandErgebnis {
  status: VersandStatus
  invoiceId: string
  invoiceNumber: string | null
  empfaenger: string | null
  /** Bei 'uebersprungen'/'fehlgeschlagen': warum */
  grund?: string
  /** true, wenn invoice_email_log geschrieben werden konnte */
  protokolliert: boolean
}

export interface VersandParams {
  invoiceId: string
  organizationId: string
  actorId: string
  /** Auch versenden, wenn sent_at bereits gesetzt ist (bewusster Nachversand). */
  erneutSenden?: boolean
}

export async function versendeRechnungPerEmail(
  admin: SupabaseClient,
  params: VersandParams
): Promise<VersandErgebnis> {
  const { invoiceId, organizationId, actorId, erneutSenden = false } = params

  // ── Rechnung org-fenced laden ──
  const { data: inv, error: invErr } = await admin
    .from('invoices')
    .select('id, invoice_number, invoice_number_formatted, status, correction_type, total_amount, period_start, period_end, due_date, sent_at, frozen_at, deleted_at, client:clients(first_name, last_name, email)')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (invErr) throw new Error(`Rechnung nicht lesbar: ${invErr.message}`)
  if (!inv) throw new Error('Rechnung nicht gefunden.')

  const nummer = inv.invoice_number_formatted || inv.invoice_number || null
  const client = inv.client as unknown as ClientJoin
  const empfaengerName = `${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim()

  const abbruch = async (
    status: Exclude<VersandStatus, 'versendet'>,
    grund: string
  ): Promise<VersandErgebnis> => {
    const protokolliert = await protokolliere(admin, {
      organizationId, invoiceId, actorId, status, grund,
      empfaengerEmail: client?.email ?? null,
      empfaengerName,
      betreff: null,
    })
    log.info('Rechnungsversand nicht durchgefuehrt', { invoiceId, status, grund })
    return { status, invoiceId, invoiceNumber: nummer, empfaenger: client?.email ?? null, grund, protokolliert }
  }

  if (inv.deleted_at) return abbruch('uebersprungen', 'Rechnung ist geloescht.')
  if (NICHT_VERSANDFAEHIG.has(inv.status)) {
    return abbruch('uebersprungen', `Status "${inv.status}" ist nicht versandfähig.`)
  }
  if (!inv.frozen_at) {
    return abbruch('uebersprungen', 'Rechnung ist nicht festgeschrieben.')
  }
  if (inv.sent_at && !erneutSenden) {
    return abbruch('uebersprungen', 'Rechnung wurde bereits versendet.')
  }
  if (!client?.email) {
    return abbruch('uebersprungen', 'Keine E-Mail-Adresse beim Klienten hinterlegt.')
  }

  // ── Bankdaten fuer den Mailtext ──
  const { data: org } = await admin
    .from('organizations')
    .select('name, iban, bic, bank_name')
    .eq('id', organizationId)
    .maybeSingle()

  // ── PDF erzeugen (laedt zugleich in den Storage + pflegt invoice_packages) ──
  const paket = await erzeugeRechnungsPaket(admin, {
    invoiceId,
    organizationId,
    generatedBy: actorId,
  })

  const zahlbar = !['gutschrift', 'storno', 'teilstorno'].includes(inv.correction_type || '')

  const mail = baueRechnungEmail({
    // Anrede ohne Vornamen: „Guten Tag Müller," waere unhoeflich, deshalb
    // wird der volle Name gesetzt, wenn kein Nachname gepflegt ist.
    empfaengerName: `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim(),
    belegart: paket.belegart,
    rechnungsnummer: paket.invoiceNumber,
    zeitraumVon: inv.period_start ?? null,
    zeitraumBis: inv.period_end ?? null,
    betragEuro: Number(inv.total_amount || 0),
    faelligAm: inv.due_date ?? null,
    zahlbar,
    organisationsName: org?.name || 'Alltagsengel UG (haftungsbeschränkt)',
    iban: org?.iban ?? null,
    bic: org?.bic ?? null,
    bank: org?.bank_name ?? null,
  })

  const ergebnis = await sendRawEmail({
    to: client.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: [{
      filename: mail.dateiname,
      content: paket.pdfBytes,
      contentType: 'application/pdf',
    }],
  })

  // ── Fehlschlag / Ueberspringen: sent_at bleibt leer ──
  if (!ergebnis.ok) {
    const status: VersandStatus = ergebnis.uebersprungen ? 'uebersprungen' : 'fehlgeschlagen'
    const protokolliert = await protokolliere(admin, {
      organizationId, invoiceId, actorId, status,
      grund: ergebnis.grund,
      empfaengerEmail: client.email,
      empfaengerName,
      betreff: mail.subject,
      pdfChecksum: paket.checksum,
      pdfSeiten: paket.pageCount,
    })

    await auditOderWarnen(admin, {
      entityType: 'invoice',
      organizationId,
      entityId: invoiceId,
      action: status === 'uebersprungen' ? 'email_uebersprungen' : 'email_fehlgeschlagen',
      newState: { empfaenger: client.email, betreff: mail.subject, grund: ergebnis.grund },
      actorId,
    })

    return {
      status,
      invoiceId,
      invoiceNumber: paket.invoiceNumber,
      empfaenger: client.email,
      grund: ergebnis.grund,
      protokolliert,
    }
  }

  // ── Erfolg: Zustellstatus auf der Rechnung setzen ──
  const versendetAm = new Date().toISOString()
  const { error: updErr } = await admin
    .from('invoices')
    .update({ sent_at: versendetAm, versand_elektronisch: true })
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)

  if (updErr) {
    // Die Mail ist raus — das darf nicht als Fehlschlag gelten, sonst
    // versendet der naechste Lauf ein zweites Mal. Nur laut protokollieren.
    log.error('sent_at konnte nach erfolgreichem Versand nicht gesetzt werden', {
      invoiceId, errorMessage: updErr.message,
    })
  }

  const protokolliert = await protokolliere(admin, {
    organizationId, invoiceId, actorId, status: 'versendet',
    empfaengerEmail: client.email,
    empfaengerName,
    betreff: mail.subject,
    providerMessageId: ergebnis.messageId,
    pdfChecksum: paket.checksum,
    pdfSeiten: paket.pageCount,
    versendetAm,
  })

  // Nach dem Versand darf ein Audit-Fehler den Aufrufer nicht mehr in einen
  // Fehlerpfad schicken — die Mail ist raus, ein Retry wuerde doppelt senden.
  await auditOderWarnen(admin, {
    entityType: 'invoice',
    organizationId,
    entityId: invoiceId,
    action: 'email_versendet',
    newState: {
      empfaenger: client.email,
      betreff: mail.subject,
      provider_message_id: ergebnis.messageId,
      pdf_checksum: paket.checksum,
    },
    actorId,
  })

  return {
    status: 'versendet',
    invoiceId,
    invoiceNumber: paket.invoiceNumber,
    empfaenger: client.email,
    protokolliert,
  }
}

// ---------------------------------------------------------------------------
// Protokoll
// ---------------------------------------------------------------------------

/** logBillingAction, das nach erfolgtem Mailversand nicht mehr werfen darf. */
async function auditOderWarnen(
  admin: SupabaseClient,
  params: Parameters<typeof logBillingAction>[1]
): Promise<void> {
  try {
    await logBillingAction(admin, params)
  } catch (err) {
    log.errorWithException('Billing-Audit nach Versand fehlgeschlagen', err, {
      entityId: params.entityId, action: params.action,
    })
  }
}

interface ProtokollParams {
  organizationId: string
  invoiceId: string
  actorId: string
  status: VersandStatus
  grund?: string
  empfaengerEmail: string | null
  empfaengerName: string
  betreff: string | null
  providerMessageId?: string | null
  pdfChecksum?: string
  pdfSeiten?: number
  versendetAm?: string
}

/**
 * Schreibt eine Zeile nach invoice_email_log und zaehlt den Versuch hoch.
 *
 * Best effort: Fehlt die Tabelle (Migration noch nicht eingespielt) oder
 * schlaegt der Insert fehl, wird nur geloggt — der Versand selbst haengt
 * an invoices.sent_at und bleibt damit korrekt.
 */
async function protokolliere(admin: SupabaseClient, p: ProtokollParams): Promise<boolean> {
  try {
    const { count } = await admin
      .from('invoice_email_log')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', p.invoiceId)

    const { error } = await admin.from('invoice_email_log').insert({
      organization_id: p.organizationId,
      invoice_id: p.invoiceId,
      empfaenger_email: p.empfaengerEmail,
      empfaenger_name: p.empfaengerName || null,
      betreff: p.betreff,
      status: p.status,
      grund: p.grund ?? null,
      versuch: (count ?? 0) + 1,
      provider_message_id: p.providerMessageId ?? null,
      pdf_checksum: p.pdfChecksum ?? null,
      pdf_seiten: p.pdfSeiten ?? null,
      versendet_am: p.versendetAm ?? null,
      created_by: p.actorId,
    })

    if (error) {
      log.warn('invoice_email_log nicht schreibbar — Versand trotzdem gültig', {
        invoiceId: p.invoiceId, errorMessage: error.message,
      })
      return false
    }
    return true
  } catch (err) {
    log.errorWithException('invoice_email_log Ausnahme', err, { invoiceId: p.invoiceId })
    return false
  }
}
