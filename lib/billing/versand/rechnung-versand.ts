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
//
// EINMAL-FREIGABE (Pilotbetrieb): steht
// PILOT_ERSTVERSAND_FREIGEGEBEN=1, verlangt jeder ERSTversand ein
// gueltiges Token aus `pilot_send_gate` (`pilotToken`). Es wird nach
// dem Preflight geprueft und unmittelbar VOR dem Absenden verbraucht.
// Steht der Schalter aus, aendert der Parameter nichts — dann sind
// ohnehin keine Freigaben ausstellbar. Begruendung der Kopplung in
// lib/pilot/send-gate.ts → pilotGatePflicht().
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '@/lib/billing/core/audit'
import { erzeugeRechnungsPaket } from '@/lib/pdf/rechnung-paket'
import { baueRechnungEmail } from '@/lib/emails/rechnung-email'
import { sendRawEmail } from '@/lib/notifications'
import {
  pruefeRechnungVersandbereit,
  darfVersenden,
  type PreflightStrenge,
  type RechnungPreflightErgebnis,
} from '@/lib/billing/preflight/rechnung-preflight'
import {
  pilotGatePflicht,
  pruefeSendeToken,
  verbraucheSendeToken,
} from '@/lib/pilot/send-gate'
import type { EnvQuelle } from '@/lib/env/pruefung'
import { euroZuCent } from '@/lib/geld'
import { logger } from '@/lib/logger'

const log = logger.child('rechnung-versand')

/**
 * Vorgangsart in notification_delivery_log.vorgang_art.
 *
 * Muss dem CHECK der Spalte genuegen (^[a-z][a-z0-9-]{2,39}$) und
 * identisch zur Registrierung in lib/notifications/vorgaenge/rechnung.ts
 * sein — sonst findet der Wiederholungslauf den Wiederhersteller nicht.
 */
export const RECHNUNG_VERSAND_ART = 'rechnung-versand'

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
  /** Das Preflight-Ergebnis, sofern einer gelaufen ist. */
  preflight?: RechnungPreflightErgebnis
}

/**
 * Wie streng der 16-Punkte-Preflight angewandt wird.
 *
 * KEIN Standardwert — und das ist der Punkt. Waere „ohne Preflight" der
 * Standard, umginge ihn jeder neue Aufrufer, ohne es zu merken; waere
 * „automatisch" der Standard, blockierte er Aufrufer, die einen Menschen vor
 * sich haben. Beides ist schlechter als eine erzwungene Entscheidung, die im
 * Diff sichtbar ist.
 *
 * 'uebersprungen' ist ausschliesslich fuer Tests gedacht, die die
 * Versandlogik selbst pruefen. Ein Regressionstest
 * (__tests__/billing/rechnung-preflight-pflicht.test.ts) stellt sicher, dass
 * kein Aufruf in app/ oder lib/ diesen Wert benutzt.
 */
export type VersandPreflightModus = PreflightStrenge | 'uebersprungen'

export interface VersandParams {
  invoiceId: string
  organizationId: string
  actorId: string
  /**
   * 'automatisch' — der Versand wurde von einem Automaten angestossen
   *   (Festschreibung mit autoVersand, Sammelrechnungslauf,
   *   Wiederholungslauf). Nur READY_FOR_SEND geht raus.
   * 'manuell' — ein Mensch hat auf Versenden gedrueckt. NEEDS_REVIEW darf
   *   er verantworten, BLOCKED nicht.
   * 'uebersprungen' — nur fuer Tests der Versandlogik.
   */
  preflight: VersandPreflightModus
  /** Auch versenden, wenn sent_at bereits gesetzt ist (bewusster Nachversand). */
  erneutSenden?: boolean
  /**
   * Keine Zeile in notification_delivery_log schreiben.
   *
   * Nur fuer den Wiederholungslauf: dort legt sendeIdempotent() die
   * Protokollzeile selbst an. Wuerde diese Funktion zusaetzlich
   * protokollieren, gaebe es pro Versuch zwei Zeilen und die
   * Versuchsobergrenze waere nach der Haelfte erreicht (siehe
   * lib/notifications/wiederherstellung.ts).
   */
  ohneZustellspur?: boolean
  /**
   * Die Einmal-Freigabe aus `pilot_send_gate` (lib/pilot/send-gate.ts).
   *
   * Nur waehrend des Pilotbetriebs von Belang: steht
   * `PILOT_ERSTVERSAND_FREIGEGEBEN` auf `1`, wird sie fuer jeden ERSTversand
   * verlangt und VOR dem Absenden verbraucht. Steht der Schalter aus, ist der
   * Wert bedeutungslos — dann sind ohnehin keine Freigaben ausstellbar.
   *
   * Ein Nachversand (`erneutSenden`) ist ausgenommen: fuer eine bereits
   * versendete Rechnung laesst sich keine Freigabe mehr ausstellen (der
   * Preflight blockt, und der UNIQUE-Teilindex `einmal_verbraucht` erst
   * recht). Ein Tokenzwang waere dort keine Sperre, sondern eine Sackgasse.
   */
  pilotToken?: string | null
  /** Nur fuer Tests der Gate-Pflicht. Werte werden nie ausgegeben. */
  quelle?: EnvQuelle
}

export async function versendeRechnungPerEmail(
  admin: SupabaseClient,
  params: VersandParams
): Promise<VersandErgebnis> {
  const {
    invoiceId, organizationId, actorId, preflight,
    erneutSenden = false, ohneZustellspur = false,
    pilotToken = null, quelle = process.env,
  } = params

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

  // ── 16-Punkte-Preflight ──
  //
  // Erst hier, nicht ganz oben: die fuenf Vorpruefungen darueber sind
  // billig und beantworten die haeufigsten Faelle („schon versendet",
  // „nicht festgeschrieben") ohne ein Dutzend Abfragen. Aber VOR der
  // PDF-Erzeugung — die laedt in den Storage und schreibt
  // invoice_packages, und einen Beleg fuer eine Rechnung zu erzeugen, die
  // gar nicht raus darf, ist eine Nebenwirkung ohne Zweck.
  let preflightErgebnis: RechnungPreflightErgebnis | undefined
  if (preflight !== 'uebersprungen') {
    preflightErgebnis = await pruefeRechnungVersandbereit(admin, {
      invoiceId, organizationId, erneutSenden,
    })
    const urteil = darfVersenden(preflightErgebnis, preflight)
    if (!urteil.erlaubt) {
      const ergebnis = await abbruch('uebersprungen', urteil.grund ?? 'Versand-Preflight nicht bestanden.')
      return { ...ergebnis, preflight: preflightErgebnis }
    }
  }

  // ── Einmal-Freigabe des Pilotbetriebs (T3-1) ──
  //
  // Nach dem Preflight, aber VOR der PDF-Erzeugung: ein Beleg fuer einen
  // Versand, der am fehlenden Token scheitert, waere eine Nebenwirkung ohne
  // Zweck. Geprueft wird hier nur; VERBRAUCHT wird unmittelbar vor dem
  // Absenden — zwischen Pruefung und Verbrauch liegt sonst die PDF-Erzeugung,
  // und ein Abbruch darin wuerde ein Token verbrennen, ohne dass eine Mail
  // rausging.
  const gatePflicht = pilotGatePflicht(quelle)
  const gateGilt = gatePflicht.pflicht && !erneutSenden
  if (gateGilt) {
    const pruefung = await pruefeSendeToken(admin, {
      token: pilotToken,
      invoiceId,
      organizationId,
      empfaenger: client.email,
      // Dieselbe Umrechnung wie im Piloten (euroZuCent), nicht `* 100`:
      // ein Rundungsunterschied wuerde ein gueltiges Token an der
      // Betragsbindung scheitern lassen.
      betragCents: euroZuCent(inv.total_amount ?? 0),
      quelle,
    })
    if (!pruefung.erlaubt) {
      const ergebnis = await abbruch(
        'uebersprungen',
        `Einmal-Freigabe nicht gueltig (${pruefung.code}): ${pruefung.grund}`,
      )
      return { ...ergebnis, preflight: preflightErgebnis }
    }
  }

  // ── Bankdaten fuer den Mailtext ──
  const { data: org } = await admin
    .from('organizations')
    .select('name, iban, bic, bank_name')
    .eq('id', organizationId)
    .maybeSingle()

  // ── PDF erzeugen (laedt zugleich in den Storage + pflegt invoice_packages) ──
  //
  // Der Fehlschlag hier war bis hierhin die EINZIGE Art, wie ein Versand
  // enden konnte, ohne eine Zeile in invoice_email_log zu hinterlassen:
  // erzeugeRechnungsPaket() wirft (fehlende Schriftart, Storage nicht
  // erreichbar, Beleg nicht baubar), die Ausnahme faellt am
  // Protokollieren vorbei nach oben. Beim automatischen Versand aus
  // freezeInvoice() wird sie dort zusaetzlich geschluckt — die Rechnung
  // war dann festgeschrieben, die Mail nie unterwegs, und ausser einer
  // Logzeile gab es keinen Hinweis darauf. Genau diese Klasse hatte den
  // Leistungsnachweis-Beleg schon einmal still zerlegt.
  //
  // Ein PDF-Fehler ist derselbe Fall wie ein Provider-Fehler: die
  // Rechnung ist nicht raus. Er wird deshalb auch gleich behandelt —
  // protokolliert, auditiert, als 'fehlgeschlagen' zurueckgegeben. Die
  // Einmal-Freigabe ist an dieser Stelle geprueft, aber noch NICHT
  // verbraucht; sie bleibt also fuer den Wiederholungslauf gueltig.
  let paket: Awaited<ReturnType<typeof erzeugeRechnungsPaket>>
  try {
    paket = await erzeugeRechnungsPaket(admin, {
      invoiceId,
      organizationId,
      generatedBy: actorId,
    })
  } catch (err) {
    const grund = `Beleg konnte nicht erzeugt werden: ${(err as Error)?.message ?? 'unbekannter Fehler'}`
    log.errorWithException('Rechnungsbeleg nicht erzeugbar — Versand abgebrochen', err, { invoiceId })

    const protokolliert = await protokolliere(admin, {
      organizationId, invoiceId, actorId, status: 'fehlgeschlagen',
      grund,
      empfaengerEmail: client.email,
      empfaengerName,
      betreff: null,
    })

    await auditOderWarnen(admin, {
      entityType: 'invoice',
      organizationId,
      entityId: invoiceId,
      action: 'email_fehlgeschlagen',
      newState: { empfaenger: client.email, grund },
      actorId,
    })

    return {
      status: 'fehlgeschlagen',
      invoiceId,
      invoiceNumber: nummer,
      empfaenger: client.email,
      grund,
      protokolliert,
      preflight: preflightErgebnis,
    }
  }

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

  // ── Freigabe verbrauchen — VOR dem Absenden ──
  //
  // Reihenfolge wie im Modulkopf von lib/pilot/send-gate.ts begruendet:
  // bricht der Lauf zwischen Verbrauch und Mail ab, ist das Token verbrannt
  // und ein Mensch stellt nach einer Sichtung ein neues aus. Andersherum
  // waere ein Abbruch genau der Zustand, in dem ein Wiederholungslauf ein
  // zweites Mal senden duerfte.
  if (gateGilt) {
    const verbrauch = await verbraucheSendeToken(admin, {
      token: String(pilotToken),
      invoiceId,
      organizationId,
      actorId,
    })
    if (!verbrauch.ok) {
      const ergebnis = await abbruch(
        'uebersprungen',
        `Einmal-Freigabe war beim Verbrauch nicht mehr offen (${verbrauch.code}): ${verbrauch.grund}`,
      )
      return { ...ergebnis, preflight: preflightErgebnis }
    }
  }

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
    // Zustellspur: der Vorgang ist die Rechnung. Zusammen mit dem Kanal
    // 'email' ist das der Idempotenzschluessel gegen Doppelversand
    // (Migration 20260923000000).
    //
    // vorgangArt/vorgangRef sind PFLICHT, nicht Schmuck: ohne sie
    // findet der Wiederholungslauf keinen Wiederhersteller und schiebt
    // eine gescheiterte Rechnungsmail nach 24 Stunden als „nicht
    // wiederherstellbar" ins Dead Letter — sie ginge nie raus.
    zustellung: ohneZustellspur
      ? undefined
      : {
          organizationId,
          correlationId: invoiceId,
          vorgangArt: RECHNUNG_VERSAND_ART,
          vorgangRef: invoiceId,
        },
    // Gegen Doppelversand beim Provider, falls ein Aufruf ins Zeitlimit
    // laeuft und wiederholt wird. Beim ausdruecklichen Nachversand
    // bewusst OHNE Schluessel — dort ist eine zweite Mail die Absicht.
    idempotenzSchluessel: erneutSenden ? undefined : `rechnung:${invoiceId}`,
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
      preflight: preflightErgebnis,
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
    preflight: preflightErgebnis,
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
