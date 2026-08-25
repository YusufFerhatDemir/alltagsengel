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
//      zurueck — mit einer der drei moeglichen Landungen:
//        'wartend'      Es wurde gar nicht gesendet (kein RESEND_API_KEY).
//                       Der Versuch zaehlt NICHT mit; eine fehlende
//                       Umgebungsvariable darf kein Kontingent verbrennen.
//        'fehlgeschlagen' Voruebergehender Fehler. `versuche` ist erhoeht,
//                       `naechster_versuch_ab` traegt die Wartezeit.
//        'aufgegeben'   Dead Letter — Endzustand. Erreicht bei einem
//                       dauerhaften Fehler (ungueltige Adresse, Hard
//                       Bounce) sofort, sonst nach MAX_VERSUCHE.
//
// WIEDERHOLUNG. verarbeiteMahnQueue({ wiederholen: true }) holt vor dem
// Lauf die faelligen 'fehlgeschlagen'-Zeilen zurueck auf 'wartend' —
// faellig heisst: versuche < MAX_VERSUCHE UND naechster_versuch_ab
// erreicht. Der Mahn-Cron ruft mit `wiederholen: true` auf; ohne das
// blieb frueher jede einmal gescheiterte Mahnung fuer immer liegen.
// Fehlerklassen und Wartezeitstaffel kommen aus dem Zustellweg der
// Benachrichtigungen (lib/notifications/retry.ts, fehlerklassen.ts) —
// eine Quelle, zwei Nutzer, kein zweiter Satz Konstanten.
//
// Schema: 20261001000000_mahnqueue_retry_dead_letter.sql
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../core/audit'
import { checkDunningBlocks, DUNNING_LABELS, type DunningLevel } from '../core/dunning'
import { baueMahnungData } from './mahnung-pdf'
import { erzeugeMahnungPdf, hatMahnText, mahnungDateiname } from './mahnung-pdf-datei'
import { sendRawEmail } from '@/lib/notifications'
import { istDauerhaft } from '@/lib/notifications/fehlerklassen'
import { MAX_VERSUCHE, wartezeitMinuten } from '@/lib/notifications/retry'
import { logger } from '@/lib/logger'

import { euroZuCent } from '@/lib/geld'
const log = logger.child('mahn-versand')

// ---------------------------------------------------------------------------
// Queue-Zugriff
// ---------------------------------------------------------------------------

/**
 * Obergrenze der Versuche je Queue-Zeile. Bewusst derselbe Wert wie im
 * Zustellweg der Benachrichtigungen — beide Wege beschreiben dieselbe
 * Sache und sollen sich nicht auseinanderentwickeln.
 */
export const MAHN_MAX_VERSUCHE = MAX_VERSUCHE

export type MahnmailStatus =
  | 'wartend'
  | 'versendet'
  | 'fehlgeschlagen'
  /** Dead Letter — Endzustand, wird von keinem Lauf mehr aufgegriffen. */
  | 'aufgegeben'
  | 'storniert'

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
  versuche: number
  letzter_versuch_am: string | null
  naechster_versuch_ab: string | null
  created_at: string
}

const QUEUE_SPALTEN =
  'id, organization_id, invoice_id, dunning_entry_id, dunning_document_id, ' +
  'empfaenger_email, empfaenger_name, betreff, inhalt, status, ' +
  'fehler_details, versendet_am, versuche, letzter_versuch_am, ' +
  'naechster_versuch_ab, created_at'

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
 *
 * Der Versuchszaehler wird HIER erhoeht, nicht erst beim Ergebnis: der
 * Anspruch ist der einzige Punkt im Ablauf, an dem genau ein Lauf
 * gewinnt. Ein Absturz zwischen Anspruch und Versand hinterlaesst so
 * einen gezaehlten Versuch statt einer Zeile, die ewig neu anlaeuft.
 * Ein uebersprungener Lauf nimmt die Erhoehung wieder zurueck
 * (rollbackAnspruch mit Ziel 'wartend').
 */
function beanspruche(
  supabase: SupabaseClient,
  id: string,
  versendetAm: string,
  versucheNeu: number,
): Promise<boolean> {
  return setzeQueueStatus(supabase, id, 'versendet', {
    versendet_am: versendetAm,
    fehler_details: null,
    versuche: versucheNeu,
    letzter_versuch_am: versendetAm,
  })
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
  ziel: 'wartend' | 'fehlgeschlagen' | 'aufgegeben',
  grund: string,
  zaehler: { versuche: number; naechsterVersuchAb: string | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from('dunning_email_queue')
    .update({
      status: ziel,
      versendet_am: null,
      fehler_details: grund.slice(0, 2000),
      versuche: zaehler.versuche,
      naechster_versuch_ab: zaehler.naechsterVersuchAb,
    })
    .eq('id', id)
    .eq('status', 'versendet')
    .eq('versendet_am', versendetAm)
    .select('id')

  if (error) throw new Error(`Mahn-Warteschlange nicht zuruecksetzbar: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Entscheidet, wo ein gescheiterter Versuch landet.
 *
 * Ein dauerhafter Fehler (ungueltige Adresse, Hard Bounce) geht sofort
 * ins Dead Letter — vier weitere Versuche an eine Adresse, die es nicht
 * gibt, kosten nur Zeit. Sonst gilt die Obergrenze.
 */
export function bewerteMahnFehlschlag(
  fehler: unknown,
  versucheNeu: number,
  jetzt: Date = new Date(),
): { ziel: 'fehlgeschlagen' | 'aufgegeben'; naechsterVersuchAb: string | null; grund: string } {
  if (istDauerhaft(fehler)) {
    return {
      ziel: 'aufgegeben',
      naechsterVersuchAb: null,
      grund: 'dauerhaft unzustellbar',
    }
  }
  if (versucheNeu >= MAHN_MAX_VERSUCHE) {
    return {
      ziel: 'aufgegeben',
      naechsterVersuchAb: null,
      grund: `Obergrenze erreicht (${versucheNeu} von ${MAHN_MAX_VERSUCHE} Versuchen)`,
    }
  }
  const wartenMs = wartezeitMinuten(versucheNeu) * 60_000
  return {
    ziel: 'fehlgeschlagen',
    naechsterVersuchAb: new Date(jetzt.getTime() + wartenMs).toISOString(),
    grund: `Versuch ${versucheNeu} von ${MAHN_MAX_VERSUCHE}`,
  }
}

/**
 * Holt die FAELLIGEN fehlgeschlagenen Eintraege einer Organisation
 * zurueck auf 'wartend'.
 *
 * Faellig heisst beides zugleich:
 *   • versuche < MAHN_MAX_VERSUCHE — was die Obergrenze erreicht hat,
 *     steht auf 'aufgegeben' und wird hier ohnehin nicht gefunden;
 *     die Bedingung faengt Altbestand ab, der vor der Migration
 *     20261001000000 auf 'fehlgeschlagen' stehengeblieben ist.
 *   • naechster_versuch_ab erreicht — sonst wuerde ein Lauf im
 *     Minutentakt die Wartezeit aushebeln.
 *
 * Zeilen ohne naechster_versuch_ab (Altbestand) gelten als faellig.
 * Sie werden in einem zweiten Durchgang geholt, weil `.or()` im
 * PostgREST-Builder eine andere Filtersprache benutzt als der Rest
 * dieser Datei — zwei klare Abfragen sind hier leichter zu pruefen
 * als eine verschachtelte.
 *
 * Ein Dead Letter kommt hierueber NICHT zurueck. Das ist der Sinn eines
 * Endzustands: er endet nur durch eine ausdrueckliche Entscheidung der
 * Verwaltung (reaktiviereAufgegebene).
 */
export async function reaktiviereFehlgeschlagene(
  supabase: SupabaseClient,
  organizationId: string,
  jetzt: Date = new Date(),
): Promise<number> {
  const stempel = jetzt.toISOString()
  let anzahl = 0

  const faellig = await supabase
    .from('dunning_email_queue')
    .update({ status: 'wartend', fehler_details: null })
    .eq('organization_id', organizationId)
    .eq('status', 'fehlgeschlagen')
    .lt('versuche', MAHN_MAX_VERSUCHE)
    .lte('naechster_versuch_ab', stempel)
    .select('id')

  if (faellig.error) {
    throw new Error(`Fehlgeschlagene Mahnmails nicht reaktivierbar: ${faellig.error.message}`)
  }
  anzahl += (faellig.data ?? []).length

  const ohneWartezeit = await supabase
    .from('dunning_email_queue')
    .update({ status: 'wartend', fehler_details: null })
    .eq('organization_id', organizationId)
    .eq('status', 'fehlgeschlagen')
    .lt('versuche', MAHN_MAX_VERSUCHE)
    .is('naechster_versuch_ab', null)
    .select('id')

  if (ohneWartezeit.error) {
    throw new Error(`Fehlgeschlagene Mahnmails nicht reaktivierbar: ${ohneWartezeit.error.message}`)
  }
  anzahl += (ohneWartezeit.data ?? []).length

  return anzahl
}

/**
 * Holt Dead-Letter-Zeilen zurueck in die Warteschlange und setzt den
 * Versuchszaehler auf 0.
 *
 * Nur fuer den ausdruecklichen Fall „Ursache behoben": eine korrigierte
 * Empfaengeradresse, ein nachgetragener Schluessel. Es gibt bewusst
 * keinen automatischen Aufrufer — sonst waere das Dead Letter kein
 * Endzustand, sondern nur eine laengere Warteschleife.
 */
export async function reaktiviereAufgegebene(
  supabase: SupabaseClient,
  organizationId: string,
  queueIds?: string[],
): Promise<number> {
  if (queueIds && queueIds.length === 0) return 0

  let abfrage = supabase
    .from('dunning_email_queue')
    .update({ status: 'wartend', fehler_details: null, versuche: 0, naechster_versuch_ab: null })
    .eq('organization_id', organizationId)
    .eq('status', 'aufgegeben')

  if (queueIds) abfrage = abfrage.in('id', queueIds)

  const { data, error } = await abfrage.select('id')
  if (error) throw new Error(`Aufgegebene Mahnmails nicht reaktivierbar: ${error.message}`)
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

/**
 * Anzahl aufgegebener Eintraege — die Zahl, die in der Betriebsansicht
 * auffallen muss. Ein stilles Dead Letter ist so schlimm wie gar keins.
 */
export async function zaehleAufgegebeneMahnmails(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('dunning_email_queue')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'aufgegeben')

  if (error) throw new Error(`Dead Letter der Mahn-Warteschlange nicht zaehlbar: ${error.message}`)
  return count ?? 0
}

// ---------------------------------------------------------------------------
// Versand
// ---------------------------------------------------------------------------

/** Rechnungsstatus, bei denen NICHT mehr gemahnt werden darf. */
const ERLEDIGT_STATUS: ReadonlySet<string> = new Set([
  'bezahlt', 'akzeptiert', 'storniert', 'abgeschrieben', 'strittig', 'abgelehnt',
])

export type MahnVersandStatus =
  | 'versendet'
  | 'storniert'
  | 'fehlgeschlagen'
  /** Dead Letter — dieser Eintrag wird von keinem Lauf mehr versucht. */
  | 'aufgegeben'
  | 'uebersprungen'

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
  /** endgueltig aufgegeben (Dead Letter) — dauerhaft oder Obergrenze */
  aufgegeben: number
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
    geprueft: 0, versendet: 0, storniert: 0, fehlgeschlagen: 0, aufgegeben: 0,
    uebersprungen: 0, reaktiviert: 0,
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
    else if (detail.status === 'aufgegeben') ergebnis.aufgegeben++
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
  const versucheVorher = Number(zeile.versuche ?? 0)
  const versucheNeu = versucheVorher + 1
  const stempel = new Date().toISOString()
  const beansprucht = await beanspruche(admin, zeile.id, stempel, versucheNeu)
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
      // Laeuft ein Aufruf ins Zeitlimit, rollt rollbackAnspruch() den
      // Eintrag auf 'fehlgeschlagen' zurueck und die Verwaltung kann ihn
      // mit `wiederholen: true` erneut anstossen. Ohne Idempotenz-
      // schluessel bekaeme der Kunde dann zwei Mahnungen, falls Resend
      // den ersten Auftrag doch noch angenommen hat.
      idempotenzSchluessel: `mahnung:${zeile.id}`,
    })

    if (!versand.ok) {
      // Ohne API-Key zurueck auf 'wartend' — der Eintrag darf nicht
      // verbrannt sein, nur weil der Key noch fehlt. Der Versuch wird
      // dabei auch nicht mitgezaehlt.
      if (versand.uebersprungen) {
        await rollbackAnspruch(admin, zeile.id, stempel, 'wartend', versand.grund, {
          versuche: versucheVorher,
          naechsterVersuchAb: null,
        })
        log.info('Mahnversand nicht durchgeführt', {
          queueId: zeile.id, ziel: 'wartend', grund: versand.grund,
        })
        return { ...basis, status: 'uebersprungen', grund: versand.grund }
      }

      // Zur Einstufung geht die ganze Fehlerlage mit, nicht nur der
      // Text: der Statuscode entscheidet ueber „dauerhaft" (400/404/410/
      // 422) gegen „voruebergehend" (429, 5xx). Nur den Text zu
      // uebergeben wuerde eine 400er-Adressablehnung wie eine
      // Netzstoerung aussehen lassen.
      return await vermerkeFehlschlag(
        admin, zeile, stempel, versucheNeu,
        { text: versand.grund, fehler: { statusCode: versand.statusCode, message: versand.grund } },
        actorId,
      )
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
    log.errorWithException('Mahnversand fehlgeschlagen', err, { queueId: zeile.id })
    try {
      return await vermerkeFehlschlag(
        admin, zeile, stempel, versucheNeu,
        { text: err instanceof Error ? err.message : String(err), fehler: err },
        actorId,
      )
    } catch (rollbackFehler) {
      log.errorWithException('Rollback des Versandanspruchs fehlgeschlagen', rollbackFehler, {
        queueId: zeile.id,
      })
      return {
        ...basis,
        status: 'fehlgeschlagen',
        grund: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

/**
 * Schreibt einen gescheiterten Versuch fort: Zaehler, Wartezeit, und —
 * wenn es nicht mehr weitergeht — das Dead Letter samt Audit-Eintrag.
 *
 * Der Audit-Eintrag steht bewusst NUR am Endzustand. Ein einzelner
 * Fehlversuch ist Betriebsrauschen; „diese Mahnung geht nie raus" ist
 * eine Tatsache, die im Nachhinein auffindbar sein muss.
 */
async function vermerkeFehlschlag(
  admin: SupabaseClient,
  zeile: MahnmailEintrag,
  stempel: string,
  versucheNeu: number,
  lage: { text: string; fehler: unknown },
  actorId: string,
): Promise<MahnVersandDetail> {
  const basis = { queueId: zeile.id, invoiceId: zeile.invoice_id, empfaenger: zeile.empfaenger_email }
  const urteil = bewerteMahnFehlschlag(lage.fehler, versucheNeu)
  const grund = `${lage.text} — ${urteil.grund}`

  await rollbackAnspruch(admin, zeile.id, stempel, urteil.ziel, grund, {
    versuche: versucheNeu,
    naechsterVersuchAb: urteil.naechsterVersuchAb,
  })

  if (urteil.ziel === 'aufgegeben') {
    await auditOderWarnen(admin, {
      entityType: 'dunning',
      organizationId: zeile.organization_id,
      entityId: zeile.dunning_entry_id || zeile.id,
      action: 'email_aufgegeben',
      newState: {
        queue_id: zeile.id,
        versuche: versucheNeu,
        max_versuche: MAHN_MAX_VERSUCHE,
        grund: urteil.grund,
      },
      actorId,
    })
    log.error('Mahnung endgültig aufgegeben', {
      queueId: zeile.id, versuche: versucheNeu, grund: urteil.grund,
    })
    return { ...basis, status: 'aufgegeben', grund }
  }

  log.info('Mahnversand fehlgeschlagen — Wiederholung vorgemerkt', {
    queueId: zeile.id, versuche: versucheNeu, naechsterVersuchAb: urteil.naechsterVersuchAb,
  })
  return { ...basis, status: 'fehlgeschlagen', grund }
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

  const totalCents = euroZuCent(inv.total_amount || 0)
  const paidCents = euroZuCent(inv.paid_amount || 0)
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
