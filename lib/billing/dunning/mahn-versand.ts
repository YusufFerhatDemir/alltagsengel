// ═══════════════════════════════════════════════════════════════
// Mahn-Consumer — versendet, was in dunning_email_queue wartet
// ═══════════════════════════════════════════════════════════════
//
// Schliesst Bereich 9 der Lueckenanalyse: „runDunningRun() schreibt bei
// jeder Eskalation einen Eintrag in dunning_email_queue — und kein
// einziger Codepfad liest diese Tabelle wieder aus."
//
// Aufbau je Eintrag:
//
//   1. STOPP-PRUEFUNG. Die Rechnung wird unmittelbar vor dem Versand neu
//      gelesen. Ist sie inzwischen bezahlt, storniert oder blockiert
//      (checkDunningBlocks), wird der Eintrag storniert und NICHTS
//      verschickt. Zwischen Mahnlauf und Versand koennen Stunden liegen —
//      ohne diese Pruefung mahnt man zahlende Kunden.
//   2. ANSPRUCH. beanspruche() setzt den Status VOR dem Senden auf
//      'versendet' und liefert false, wenn ein paralleler Lauf schneller
//      war. Damit kann dieselbe Mahnung nicht doppelt rausgehen.
//   3. VERSAND mit PDF-Anhang (erzeugeMahnungPdf).
//   4. Bei Fehlschlag rollt rollbackAnspruch() den eigenen Anspruch
//      zurueck: ohne RESEND_API_KEY zurueck auf 'wartend' (der Eintrag ist
//      nicht verbrannt), bei einer Provider-Ablehnung auf
//      'fehlgeschlagen' (wird bewusst NICHT automatisch wiederholt —
//      dafuer gibt es `wiederholen: true`).
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../core/audit'
import { checkDunningBlocks, DUNNING_LABELS, type DunningLevel } from '../core/dunning'
import { baueMahnungData } from './mahnung-pdf'
import { erzeugeMahnungPdf, hatMahnText, mahnungDateiname } from './mahnung-pdf-datei'
import { sendRawEmail } from '@/lib/notifications'
import { logger } from '@/lib/logger'

const log = logger.child('mahn-versand')

// ---------------------------------------------------------------------------
// Queue-Zugriff
// ---------------------------------------------------------------------------

export type MahnmailStatus = 'wartend' | 'versendet' | 'fehlgeschlagen' | 'storniert'

export interface MahnmailEintrag {
  id: string
  organization_id: string
  invoice_id: string
  dunning_entry_id: string | null
  dunning_document_id: string | null
  empfaenger_email: string
  empfaenger_name: string | null
  betreff: string
  inhalt: string
  status: MahnmailStatus
  fehler_details: string | null
  versendet_am: string | null
  created_at: string
}

const QUEUE_SPALTEN =
  'id, organization_id, invoice_id, dunning_entry_id, dunning_document_id, ' +
  'empfaenger_email, empfaenger_name, betreff, inhalt, status, ' +
  'fehler_details, versendet_am, created_at'

/**
 * Wartende Mahn-E-Mails einer Organisation, aelteste zuerst.
 *
 * Fail-closed: ein Lesefehler wirft, statt eine leere Liste zu liefern —
 * „nichts zu tun" und „ich konnte nicht nachsehen" duerfen sich nicht
 * gleich anfuehlen.
 */
export async function holeWartendeMahnmails(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 50,
): Promise<MahnmailEintrag[]> {
  const { data, error } = await supabase
    .from('dunning_email_queue')
    .select(QUEUE_SPALTEN)
    .eq('organization_id', organizationId)
    .eq('status', 'wartend')
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500))

  if (error) throw new Error(`Mahn-Warteschlange nicht lesbar: ${error.message}`)
  return (data ?? []) as unknown as MahnmailEintrag[]
}

/**
 * Statuswechsel eines wartenden Eintrags.
 *
 * Der Filter auf `status='wartend'` ist die Sperre gegen Doppelversand:
 * bei zwei parallelen Laeufen trifft die zweite Aktualisierung keine Zeile
 * mehr und meldet false.
 */
async function setzeQueueStatus(
  supabase: SupabaseClient,
  id: string,
  status: Exclude<MahnmailStatus, 'wartend'>,
  felder: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await supabase
    .from('dunning_email_queue')
    .update({ status, ...felder })
    .eq('id', id)
    .eq('status', 'wartend')
    .select('id')

  if (error) throw new Error(`Mahn-Warteschlange nicht aktualisierbar: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Beansprucht einen Eintrag, indem er VOR dem Senden auf 'versendet'
 * gesetzt wird. false ⇒ ein anderer Lauf war schneller.
 */
function beanspruche(
  supabase: SupabaseClient,
  id: string,
  versendetAm: string,
): Promise<boolean> {
  return setzeQueueStatus(supabase, id, 'versendet', { versendet_am: versendetAm, fehler_details: null })
}

/** Eintrag stornieren (Rechnung bezahlt, Mahnung zurueckgenommen). */
function storniereMahnmail(
  supabase: SupabaseClient,
  id: string,
  grund: string,
): Promise<boolean> {
  return setzeQueueStatus(supabase, id, 'storniert', { fehler_details: grund.slice(0, 2000) })
}

/**
 * Nimmt einen beanspruchten Eintrag zurueck, wenn der Versand danach doch
 * nicht stattgefunden hat.
 *
 * `versendetAm` ist der Zeitstempel, den der Konsument beim Beanspruchen
 * selbst geschrieben hat. Der Filter darauf stellt sicher, dass NUR der
 * eigene Anspruch zurueckgerollt wird und niemals ein Eintrag, den ein
 * anderer Lauf tatsaechlich versendet hat.
 */
async function rollbackAnspruch(
  supabase: SupabaseClient,
  id: string,
  versendetAm: string,
  ziel: 'wartend' | 'fehlgeschlagen',
  grund: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('dunning_email_queue')
    .update({ status: ziel, versendet_am: null, fehler_details: grund.slice(0, 2000) })
    .eq('id', id)
    .eq('status', 'versendet')
    .eq('versendet_am', versendetAm)
    .select('id')

  if (error) throw new Error(`Mahn-Warteschlange nicht zuruecksetzbar: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Stellt fehlgeschlagene Eintraege einer Organisation wieder auf 'wartend'.
 *
 * Ausdruecklich manuell: die Queue wiederholt von sich aus nichts. Gedacht
 * fuer den Fall „Ursache behoben" — etwa ein nachgetragener
 * RESEND_API_KEY oder eine korrigierte E-Mail-Adresse.
 */
export async function reaktiviereFehlgeschlagene(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('dunning_email_queue')
    .update({ status: 'wartend', fehler_details: null })
    .eq('organization_id', organizationId)
    .eq('status', 'fehlgeschlagen')
    .select('id')

  if (error) throw new Error(`Fehlgeschlagene Mahnmails nicht reaktivierbar: ${error.message}`)
  return (data ?? []).length
}

/** Anzahl wartender Eintraege — fuer Badges und den Go-Live-Check. */
export async function zaehleWartendeMahnmails(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('dunning_email_queue')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'wartend')

  if (error) throw new Error(`Mahn-Warteschlange nicht zaehlbar: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------

/** Rechnungsstatus, bei denen NICHT mehr gemahnt werden darf. */
const ERLEDIGT_STATUS: ReadonlySet<string> = new Set([
  'bezahlt', 'akzeptiert', 'storniert', 'abgeschrieben', 'strittig', 'abgelehnt',
])

export type MahnVersandStatus = 'versendet' | 'storniert' | 'fehlgeschlagen' | 'uebersprungen'

export interface MahnVersandDetail {
  queueId: string
  invoiceId: string
  empfaenger: string
  status: MahnVersandStatus
  grund?: string
}

export interface MahnVersandErgebnis {
  organizationId: string
  /** Eintraege, die aus der Queue geholt und bearbeitet wurden */
  geprueft: number
  versendet: number
  /** Zahlung eingegangen / Mahnung blockiert → nicht versendet */
  storniert: number
  fehlgeschlagen: number
  /** kein RESEND_API_KEY oder paralleler Lauf — Eintrag bleibt bearbeitbar */
  uebersprungen: number
  /** Anzahl vorab reaktivierter 'fehlgeschlagen'-Eintraege */
  reaktiviert: number
  details: MahnVersandDetail[]
}

export interface MahnVersandOptions {
  organizationId: string
  /** Hoechstzahl Eintraege pro Lauf (Default 50, max 500). */
  limit?: number
  /**
   * Vorher alle 'fehlgeschlagen'-Eintraege dieser Organisation wieder auf
   * 'wartend' setzen. Ausdrueckliche Entscheidung des Aufrufers — die
   * Queue wiederholt von sich aus nichts.
   */
  wiederholen?: boolean
  /** Actor fuer den Audit-Trail. */
  actorId: string
}

export async function verarbeiteMahnQueue(
  admin: SupabaseClient,
  options: MahnVersandOptions
): Promise<MahnVersandErgebnis> {
  const { organizationId, limit = 50, wiederholen = false, actorId } = options

  const ergebnis: MahnVersandErgebnis = {
    organizationId,
    geprueft: 0, versendet: 0, storniert: 0, fehlgeschlagen: 0, uebersprungen: 0,
    reaktiviert: 0,
    details: [],
  }

  if (wiederholen) {
    ergebnis.reaktiviert = await reaktiviereFehlgeschlagene(admin, organizationId)
  }

  const zeilen = await holeWartendeMahnmails(admin, organizationId, limit)

  for (const zeile of zeilen) {
    const detail = await verarbeiteEintrag(admin, zeile, actorId)
    ergebnis.geprueft++
    ergebnis.details.push(detail)
    if (detail.status === 'versendet') ergebnis.versendet++
    else if (detail.status === 'storniert') ergebnis.storniert++
    else if (detail.status === 'fehlgeschlagen') ergebnis.fehlgeschlagen++
    else ergebnis.uebersprungen++
  }

  return ergebnis
}

async function verarbeiteEintrag(
  admin: SupabaseClient,
  zeile: MahnmailEintrag,
  actorId: string
): Promise<MahnVersandDetail> {
  const basis = { queueId: zeile.id, invoiceId: zeile.invoice_id, empfaenger: zeile.empfaenger_email }

  // ── 1. Stopp-Pruefung VOR dem Beanspruchen ──
  const stopp = await ermittleStoppgrund(admin, zeile.invoice_id)
  if (stopp) {
    const storniert = await storniereMahnmail(admin, zeile.id, stopp)
    if (!storniert) {
      return { ...basis, status: 'uebersprungen', grund: 'Parallel bereits verarbeitet.' }
    }
    await auditOderWarnen(admin, {
      entityType: 'dunning',
      organizationId: zeile.organization_id,
      entityId: zeile.dunning_entry_id || zeile.id,
      action: 'email_storniert',
      newState: { queue_id: zeile.id, grund: stopp },
      actorId,
    })
    log.info('Mahnung gestoppt', { queueId: zeile.id, grund: stopp })
    return { ...basis, status: 'storniert', grund: stopp }
  }

  // ── 2. Eintrag beanspruchen (at-most-once) ──
  const stempel = new Date().toISOString()
  const beansprucht = await beanspruche(admin, zeile.id, stempel)
  if (!beansprucht) {
    // Ein paralleler Lauf war schneller — nichts tun, kein Doppelversand.
    return { ...basis, status: 'uebersprungen', grund: 'Parallel bereits verarbeitet.' }
  }

  // ── 3. PDF + Mail bauen und senden ──
  try {
    const anhang = await baueMahnungAnhang(admin, zeile)

    const versand = await sendRawEmail({
      to: zeile.empfaenger_email,
      subject: zeile.betreff,
      html: alsHtml(zeile.betreff, zeile.inhalt, Boolean(anhang)),
      text: zeile.inhalt,
      attachments: anhang ? [anhang] : undefined,
      // Vorgang ist die Queue-Zeile: genau eine Mahnmail. Der
      // at-most-once-Anspruch oben schuetzt den Lauf, die Zustellspur
      // macht das Ergebnis nachtraeglich pruefbar.
      zustellung: {
        organizationId: zeile.organization_id,
        correlationId: zeile.id,
      },
    })

    if (!versand.ok) {
      // Ohne API-Key zurueck auf 'wartend' — der Eintrag darf nicht
      // verbrannt sein, nur weil der Key noch fehlt.
      const ziel = versand.uebersprungen ? 'wartend' : 'fehlgeschlagen'
      await rollbackAnspruch(admin, zeile.id, stempel, ziel, versand.grund)
      log.info('Mahnversand nicht durchgeführt', { queueId: zeile.id, ziel, grund: versand.grund })
      return {
        ...basis,
        status: versand.uebersprungen ? 'uebersprungen' : 'fehlgeschlagen',
        grund: versand.grund,
      }
    }

    await auditOderWarnen(admin, {
      entityType: 'dunning',
      organizationId: zeile.organization_id,
      entityId: zeile.dunning_entry_id || zeile.id,
      action: 'email_versendet',
      newState: {
        queue_id: zeile.id,
        empfaenger: zeile.empfaenger_email,
        betreff: zeile.betreff,
        mit_pdf: Boolean(anhang),
        provider_message_id: versand.messageId,
      },
      actorId,
    })

    return { ...basis, status: 'versendet' }
  } catch (err) {
    const grund = err instanceof Error ? err.message : String(err)
    await rollbackAnspruch(admin, zeile.id, stempel, 'fehlgeschlagen', grund)
      .catch(e => log.errorWithException('Rollback des Versandanspruchs fehlgeschlagen', e, { queueId: zeile.id }))
    log.errorWithException('Mahnversand fehlgeschlagen', err, { queueId: zeile.id })
    return { ...basis, status: 'fehlgeschlagen', grund }
  }
}

/**
 * Liefert einen Grund, wenn die Mahnung NICHT mehr raus darf — sonst null.
 * Deckt vor allem den Fall „Kunde hat zwischen Mahnlauf und Versand
 * bezahlt" ab.
 */
async function ermittleStoppgrund(admin: SupabaseClient, invoiceId: string): Promise<string | null> {
  const { data: inv, error } = await admin
    .from('invoices')
    .select('id, status, total_amount, paid_amount, deleted_at')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error) return `Rechnung nicht lesbar: ${error.message}`
  if (!inv) return 'Rechnung nicht gefunden.'
  if (inv.deleted_at) return 'Rechnung ist gelöscht.'
  if (ERLEDIGT_STATUS.has(inv.status)) return `Rechnung steht auf "${inv.status}" — keine Mahnung.`

  const totalCents = Math.round(Number(inv.total_amount || 0) * 100)
  const paidCents = Math.round(Number(inv.paid_amount || 0) * 100)
  if (totalCents - paidCents <= 0) return 'Zahlung eingegangen — Forderung ausgeglichen.'

  const blocks = await checkDunningBlocks(admin, invoiceId)
  if (blocks.length > 0) return blocks.map(b => b.reason).join('; ')

  return null
}

/**
 * Baut den PDF-Anhang zur Mahnung.
 *
 * Der Mahnlauf hat beim Anlegen der Queue-Zeile bereits ein
 * dunning_documents-Dokument erzeugt. Hier wird deshalb NUR
 * baueMahnungData() gerufen und keine zweite Dokumentzeile angelegt —
 * sonst entstuende bei jedem Versandversuch eine weitere. Fuer Stufen ohne
 * Schreibtext ('offen', 'inkasso_vorbereitung') gibt es keinen Anhang; die
 * Mail geht dann mit dem Queue-Text alleine raus.
 */
async function baueMahnungAnhang(
  admin: SupabaseClient,
  zeile: MahnmailEintrag
): Promise<{ filename: string; content: Uint8Array; contentType: string } | null> {
  if (!zeile.dunning_entry_id) return null

  const { data: entry } = await admin
    .from('dunning_entries')
    .select('id, dunning_level')
    .eq('id', zeile.dunning_entry_id)
    .maybeSingle()

  const level = (entry?.dunning_level as DunningLevel) || null
  if (!level || !hatMahnText(level)) {
    log.info('Keine PDF-Vorlage für Mahnstufe — Mail ohne Anhang', {
      queueId: zeile.id, stufe: level ? DUNNING_LABELS[level] : 'unbekannt',
    })
    return null
  }

  const { mahnungData } = await baueMahnungData(admin, {
    organizationId: zeile.organization_id,
    invoiceId: zeile.invoice_id,
    dunningEntryId: zeile.dunning_entry_id,
    dunningLevel: level,
  })

  const pdf = await erzeugeMahnungPdf(mahnungData)
  return {
    filename: mahnungDateiname(mahnungData),
    content: pdf,
    contentType: 'application/pdf',
  }
}

/** Der Queue-Text ist Klartext — fuer die HTML-Variante escapen und umbrechen. */
function alsHtml(betreff: string, text: string, mitAnhang: boolean): string {
  const esc = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${esc(betreff)}</title></head>
<body style="margin:0;padding:0;background:#F5F2EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1612;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:22px;font-weight:700;color:#1A1612;">Alltags<span style="color:#C9963C;">Engel</span></span>
    </div>
    <div style="background:#fff;border-radius:16px;padding:32px 28px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
      <div style="white-space:pre-line;font-size:14px;line-height:1.65;">${esc(text)}</div>
    </div>
    <div style="text-align:center;margin-top:24px;font-size:11px;color:#aaa;line-height:1.6;">
      <p style="margin:0;">${mitAnhang ? 'Das vollständige Schreiben finden Sie im PDF-Anhang.' : 'Diese E-Mail wurde automatisch erzeugt.'}</p>
    </div>
  </div>
</body>
</html>`
}

/** Audit, das den Versand nicht kippen darf. */
async function auditOderWarnen(
  admin: SupabaseClient,
  params: Parameters<typeof logBillingAction>[1]
): Promise<void> {
  try {
    await logBillingAction(admin, params)
  } catch (err) {
    log.errorWithException('Billing-Audit im Mahnversand fehlgeschlagen', err, {
      entityId: params.entityId, action: params.action,
    })
  }
}
