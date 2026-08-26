// ═══════════════════════════════════════════════════════════════════════════
// PILOT CONTROL CENTER — der Erstbetrieb als Phasenkette
//
// PROBLEM, DAS DIESE DATEI LÖST
// `/admin/pilot` beantwortet drei Fragen: darf abgerechnet werden
// (Betriebs-Checkliste), wie weit ist ein Kunde (Kundenketten), was ist
// liegen geblieben (Money-Path-Betriebslage). Was keine davon beantwortet:
//
//   „Wo im ERSTBETRIEB stehen wir gerade, und was ist der nächste Schritt?"
//
// Der begleitete Erstlauf ist eine Kette mit Reihenfolge — ein CAMT-Import
// vor dem ersten Rechnungsversand ergibt keinen Sinn, eine Zuordnung vor
// dem Zahlungseingang schon gar nicht. Diese Datei bildet die Kette ab und
// misst je Phase, wo sie steht.
//
// ── DIE NEUN PHASEN ────────────────────────────────────────────────────────
//   PRE-FLIGHT     Rechnung geprüft, bereit zum Versand
//   APPROVAL       Einmal-Freigabe für genau diese Rechnung erteilt
//   SEND           Versand ausgelöst
//   DELIVERY       Zustellung beim Provider belegt
//   CAMT           Kontoauszug eingelesen
//   MATCH          Bankbuchung einer Rechnung zugeordnet
//   ALLOCATION     Zahlung auf die Rechnung gebucht
//   RECONCILIATION Die Kette geht über alle neun Stufen auf
//   AUDIT          Jeder Schritt hat seine Protokollzeile
//
// ── DIE WICHTIGSTE REGEL DIESER DATEI ──────────────────────────────────────
// ‼️ SIE FÜHRT KEINE PHASE AUS. ‼️
//
// Dieses Modul exportiert keine Funktion, die schreibt — kein insert, kein
// update, kein delete. Jede Phase trägt in `gate` den Namen des Moduls, das
// die Aktion TATSÄCHLICH freigibt. Ein `status: 'READY'` auf dieser Seite
// ist eine Messung; die Erlaubnis liegt woanders und wird zum Zeitpunkt der
// Aktion neu geprüft. Zwischen Messung und Aktion können Minuten liegen, und
// in dieser Zeit kann sich alles ändern.
//
// Der Auftrag sagt es direkt: „Keine kritische Aktion ohne Backend-Gate."
// Diese Datei IST kein Gate. Sie ist die Anzeigetafel davor.
//
// ── FAIL-CLOSED ────────────────────────────────────────────────────────────
// Eine Messung, die scheitert, ergibt `null` — nie 0 — und die Phase wird
// BLOCKED mit dem Grund. Eine Phase, deren Vorbedingung nicht messbar ist,
// darf nie READY aussehen: der fehlende Wert könnte genau der schlechte sein.
//
// ── NOCH NICHT ANGEWENDETE MIGRATION ───────────────────────────────────────
// Die APPROVAL-Phase liest `pilot_send_gate` (Migration 20261005000000).
// Ist sie nicht angewendet, antwortet PostgREST mit einem Fehler — die Phase
// wird dann BLOCKED mit genau diesem Grund und NICHT NOT_STARTED. Der
// Unterschied zählt: „noch niemand hat freigegeben" und „die Tabelle gibt es
// nicht" führen zu völlig verschiedenen nächsten Schritten.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { heuteBerlin } from '@/lib/utils/timezone'
import { versandFlagsStand } from '@/lib/config/versand-flags'
import { camtImportModus } from '@/lib/billing/camt/camt-modus'
import { NICHT_VERSANDFAEHIGE_STATUS, type Messwert } from './control-center'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type PhaseId =
  | 'PRE_FLIGHT'
  | 'APPROVAL'
  | 'SEND'
  | 'DELIVERY'
  | 'CAMT'
  | 'MATCH'
  | 'ALLOCATION'
  | 'RECONCILIATION'
  | 'AUDIT'

export const PHASEN_REIHENFOLGE: PhaseId[] = [
  'PRE_FLIGHT', 'APPROVAL', 'SEND', 'DELIVERY',
  'CAMT', 'MATCH', 'ALLOCATION', 'RECONCILIATION', 'AUDIT',
]

export const PHASEN_TITEL: Record<PhaseId, string> = {
  PRE_FLIGHT: 'PRE-FLIGHT — Rechnung geprüft',
  APPROVAL: 'APPROVAL — Einmal-Freigabe erteilt',
  SEND: 'SEND — Versand ausgelöst',
  DELIVERY: 'DELIVERY — Zustellung belegt',
  CAMT: 'CAMT — Kontoauszug eingelesen',
  MATCH: 'MATCH — Buchung zugeordnet',
  ALLOCATION: 'ALLOCATION — Zahlung gebucht',
  RECONCILIATION: 'RECONCILIATION — Kette geht auf',
  AUDIT: 'AUDIT — lückenlos protokolliert',
}

export type VorgangStatus =
  /** Noch nichts passiert, Vorbedingungen offen oder nicht erreicht. */
  | 'NOT_STARTED'
  /** Alle Vorbedingungen erfüllt — ein Mensch ist am Zug. */
  | 'READY'
  /** Freigabe erteilt, Ausführung steht aus. */
  | 'APPROVED'
  /** Läuft gerade — etwas ist unterwegs und noch nicht abgeschlossen. */
  | 'EXECUTING'
  /** Abgeschlossen UND gegengeprüft. */
  | 'VERIFIED'
  /** Versucht und gescheitert. */
  | 'FAILED'
  /** Eine Sperre verbietet den Schritt — oder er ist nicht messbar. */
  | 'BLOCKED'

export const STATUS_REIHENFOLGE: VorgangStatus[] = [
  'NOT_STARTED', 'READY', 'APPROVED', 'EXECUTING', 'VERIFIED', 'FAILED', 'BLOCKED',
]

export interface PhasenKennzahl {
  label: string
  wert: Messwert
  bedeutung: string
}

export interface PilotPhase {
  id: PhaseId
  nr: number
  titel: string
  status: VorgangStatus
  /** Ein Satz: warum dieser Status. Aus gemessenen Werten. */
  begruendung: string
  /**
   * Das Modul, das diese Aktion TATSÄCHLICH freigibt.
   * Steht im Datenmodell und nicht nur im Seitentext — damit jede
   * Oberfläche, die diese Phase anzeigt, den Riegel mitnennen muss.
   */
  gate: string
  /** Was jetzt konkret zu tun ist. `null`, wenn nichts ansteht. */
  naechsterSchritt: string | null
  kennzahlen: PhasenKennzahl[]
}

export interface VersandSperreDetail {
  id: string
  schwere: string
  grund: string
  invoice_id: string | null
  gesetzt_am: string
}

export interface PilotPhasenUebersicht {
  stichtag: string
  organizationId: string
  /** Immer false — diese Übersicht löst nichts aus. */
  ausfuehrend: false
  phasen: PilotPhase[]
  /** Die erste Phase, die nicht VERIFIED ist — der Ort zum Weiterarbeiten. */
  aktuellePhase: PilotPhase | null
  /** Wie viele Phasen sind durch? */
  fortschritt: { verifiziert: number; gesamt: number; prozent: number }
  /** Offene Versandsperren mit Details — leer wenn keine, null wenn nicht lesbar. */
  versandSperrenDetails: VersandSperreDetail[] | null
  /** Messungen, die technisch nicht ausgeführt werden konnten. */
  hinweise: string[]
  /** Muss jede Oberfläche mitzeigen. */
  freigabeHinweis: string
}

export const PHASEN_FREIGABE_HINWEIS =
  'Diese Übersicht führt keine Phase aus. Jede kritische Aktion wird zum '
  + 'Zeitpunkt der Ausführung im Backend neu geprüft (Preflight, Send-Gate, '
  + 'Allocation-Gate, Mahn-Safety-Gate, Dublettensperre, Mandantenzaun). '
  + 'Ein READY auf dieser Seite erlaubt nichts.'

export interface PhasenParams {
  organizationId: string
  /** Nur für die Prüfung der Umgebungsschalter. Werte werden nie ausgegeben. */
  quelle?: Record<string, string | undefined>
}

// ---------------------------------------------------------------------------
// Zählhilfe
// ---------------------------------------------------------------------------

interface Zaehler {
  hinweise: string[]
}

/**
 * Zählt Zeilen und fängt jeden Fehler ab.
 *
 * Ein Lesefehler ergibt `null`, nicht 0. Der Unterschied ist die ganze
 * Zuverlässigkeit dieser Seite: „keine offene Freigabe" und „Tabelle nicht
 * lesbar" dürfen nicht dieselbe Zahl erzeugen.
 */
async function zaehle(
  z: Zaehler,
  label: string,
  bauen: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<Messwert> {
  try {
    const { count, error } = await bauen()
    if (error) {
      z.hinweise.push(`${label}: ${(error as { message?: string })?.message ?? 'unbekannter Fehler'}`)
      return null
    }
    return count ?? 0
  } catch (err) {
    z.hinweise.push(`${label}: ${(err as Error).message}`)
    return null
  }
}

function kennzahl(label: string, wert: Messwert, bedeutung: string): PhasenKennzahl {
  return { label, wert, bedeutung }
}

/** true, sobald irgendeine der Zahlen nicht messbar war. */
function unmessbar(...werte: Messwert[]): boolean {
  return werte.some(w => w === null)
}

// ---------------------------------------------------------------------------
// Die neun Phasen
// ---------------------------------------------------------------------------

export async function ermittlePilotPhasen(
  admin: SupabaseClient,
  params: PhasenParams,
): Promise<PilotPhasenUebersicht> {
  const orgId = params.organizationId
  const quelle = params.quelle ?? (process.env as Record<string, string | undefined>)
  const z: Zaehler = { hinweise: [] }
  const flags = versandFlagsStand(quelle)
  const camtModus = camtImportModus(quelle)

  const nichtVersandfaehig = `(${NICHT_VERSANDFAEHIGE_STATUS.join(',')})`
  const inv = () => admin
    .from('invoices').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).is('deleted_at', null)

  // ── Rohmessungen ──
  const [
    versandbereit, versendet, versendetUnbelegt, protokollErfolg, protokollFehler, protokollWartend,
    camtImporte, camtFehler, buchungen, automatisch, klaerfaelle,
    zuordnungen, auditZeilen,
  ] = await Promise.all([
    zaehle(z, 'invoices (versandbereit)', () =>
      inv().is('sent_at', null).not('frozen_at', 'is', null).not('status', 'in', nichtVersandfaehig)),
    zaehle(z, 'invoices (versendet)', () => inv().not('sent_at', 'is', null)),
    zaehle(z, 'invoices (versendet ohne Festschreibung)', () =>
      inv().not('sent_at', 'is', null).is('frozen_at', null)),
    zaehle(z, 'invoice_email_log (versendet)', () => admin
      .from('invoice_email_log').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'versendet')),
    zaehle(z, 'invoice_email_log (fehlgeschlagen)', () => admin
      .from('invoice_email_log').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'fehlgeschlagen')),
    zaehle(z, 'invoice_email_log (uebersprungen)', () => admin
      .from('invoice_email_log').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'uebersprungen')),
    zaehle(z, 'camt_imports', () => admin
      .from('camt_imports').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
    zaehle(z, 'camt_imports (fehler)', () => admin
      .from('camt_imports').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'fehler')),
    zaehle(z, 'zahlungseingaenge', () => admin
      .from('zahlungseingaenge').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
    zaehle(z, 'zahlungseingaenge (automatisch)', () => admin
      .from('zahlungseingaenge').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('zuordnungs_status', 'automatisch')),
    zaehle(z, 'klaerfaelle (offen)', () => admin
      .from('klaerfaelle').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).eq('status', 'offen')),
    zaehle(z, 'payment_allocations', () => admin
      .from('payment_allocations').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
    zaehle(z, 'billing_audit_trail', () => admin
      .from('billing_audit_trail').select('id', { count: 'exact', head: true }).eq('organization_id', orgId)),
  ])

  // `pilot_send_gate` hängt an einer Migration, die noch nicht angewendet
  // sein muss. Getrennt gemessen, damit ein Fehler hier nicht die anderen
  // acht Phasen mitreißt.
  const gateOffen = await zaehle(z, 'pilot_send_gate (offen)', () => admin
    .from('pilot_send_gate').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).is('verbraucht_am', null).is('entwertet_am', null))
  const gateVerbraucht = await zaehle(z, 'pilot_send_gate (verbraucht)', () => admin
    .from('pilot_send_gate').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).not('verbraucht_am', 'is', null))
  const versandSperren = await zaehle(z, 'pilot_versand_sperre (offen)', () => admin
    .from('pilot_versand_sperre').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).is('aufgehoben_am', null))

  // ── Was ein Versandzeitpunkt belegt ──────────────────────────────────────
  // `sent_at` allein ist kein Beleg. Der Versandweg setzt es nur nach einem
  // Lauf, der `frozen_at` voraussetzt; eine Zeile mit Versandzeitpunkt OHNE
  // Festschreibung kann also nicht über ihn entstanden sein. Wird sie
  // mitgezählt, meldet PRE-FLIGHT „mindestens einmal durchlaufen" und SEND
  // „VERIFIED", obwohl der Pfad nie lief — die Anzeigetafel behauptete dann
  // genau den Fortschritt, den zu messen ihre Aufgabe ist.
  const versendetBelegt = versendet !== null && versendetUnbelegt !== null
    ? Math.max(0, versendet - versendetUnbelegt)
    : null

  let versandSperrenDetails: VersandSperreDetail[] | null = null
  try {
    const { data, error } = await admin
      .from('pilot_versand_sperre')
      .select('id, schwere, grund, invoice_id, gesetzt_am')
      .eq('organization_id', orgId)
      .is('aufgehoben_am', null)
      .order('gesetzt_am', { ascending: false })
      .limit(50)
    if (!error && data) {
      versandSperrenDetails = data as VersandSperreDetail[]
    }
  } catch {
    z.hinweise.push('pilot_versand_sperre Details nicht lesbar')
  }

  const phasen: PilotPhase[] = []
  const phase = (
    id: PhaseId,
    status: VorgangStatus,
    begruendung: string,
    gate: string,
    naechsterSchritt: string | null,
    kennzahlen: PhasenKennzahl[],
  ) => {
    phasen.push({
      id, nr: PHASEN_REIHENFOLGE.indexOf(id) + 1, titel: PHASEN_TITEL[id],
      status, begruendung, gate, naechsterSchritt, kennzahlen,
    })
  }

  // ═══ 1 — PRE-FLIGHT ═══
  {
    const kz = [
      kennzahl('versandbereit', versandbereit, 'Festgeschrieben, versandfähiger Status, noch nicht versendet.'),
      kennzahl('bereits versendet (belegt)', versendetBelegt, 'sent_at gesetzt UND festgeschrieben.'),
      kennzahl('Versandzeitpunkt ohne Festschreibung', versendetUnbelegt,
        'Über den Versandweg nicht entstehbar — belegt keinen Durchlauf des Preflights.'),
    ]
    if (unmessbar(versandbereit, versendet, versendetUnbelegt)) {
      phase('PRE_FLIGHT', 'BLOCKED',
        'Der Rechnungsbestand ist nicht messbar — siehe Hinweise. Solange das so ist, gilt die Phase als gesperrt, nicht als leer.',
        'lib/billing/preflight/rechnung-preflight.ts',
        'Die fehlgeschlagene Abfrage in den Hinweisen nachsehen.', kz)
    } else if ((versendetBelegt ?? 0) > 0) {
      phase('PRE_FLIGHT', 'VERIFIED',
        `${versendetBelegt} festgeschriebene Rechnung(en) sind versendet — der Preflight ist mindestens einmal durchlaufen.`,
        'lib/billing/preflight/rechnung-preflight.ts', null, kz)
    } else if ((versandbereit ?? 0) > 0) {
      phase('PRE_FLIGHT', 'READY',
        `${versandbereit} Rechnung(en) sind festgeschrieben und versandfähig. Ob eine davon READY_FOR_SEND ist, entscheidet der 16-Punkte-Preflight je Rechnung — diese Zahl sagt es NICHT.`,
        'lib/billing/preflight/rechnung-preflight.ts',
        'GET /api/billing/invoices/<id>/preflight für die Rechnung aufrufen, die den Erstlauf tragen soll.', kz)
    } else {
      phase('PRE_FLIGHT', 'NOT_STARTED',
        'Keine festgeschriebene, versandfähige Rechnung vorhanden.'
        + ((versendetUnbelegt ?? 0) > 0
          ? ` ${versendetUnbelegt} Rechnung(en) tragen zwar einen Versandzeitpunkt, sind aber nicht `
            + 'festgeschrieben — sie können nicht über den Versandweg entstanden sein und zählen '
            + 'hier nicht als Durchlauf.'
          : ''),
        'lib/billing/preflight/rechnung-preflight.ts',
        'Eine Rechnung erzeugen und festschreiben (freezeInvoice).', kz)
    }
  }

  // ═══ 2 — APPROVAL ═══
  {
    const kz = [
      kennzahl('offene Freigaben', gateOffen, 'Ausgestellte, noch nicht verbrauchte Einmal-Tokens.'),
      kennzahl('verbrauchte Freigaben', gateVerbraucht, 'Tokens, mit denen versendet wurde.'),
      kennzahl('offene Versandsperren', versandSperren, 'Sperren aus einer abweichenden Nachprüfung. > 0 = kein weiterer Versand.'),
    ]
    if (unmessbar(gateOffen, gateVerbraucht)) {
      phase('APPROVAL', 'BLOCKED',
        'Die Freigabetabelle ist nicht lesbar. Steht in den Hinweisen ein Fehler zu `pilot_send_gate`, ist die Migration 20261005000000 vermutlich noch nicht angewendet — das ist NICHT dasselbe wie „noch keine Freigabe".',
        'lib/pilot/send-gate.ts',
        'Migration 20261005000000_pilot_send_gate.sql im Supabase-SQL-Editor anwenden.', kz)
    } else if ((versandSperren ?? 0) > 0) {
      phase('APPROVAL', 'BLOCKED',
        `${versandSperren} offene Versandsperre(n) aus einer Nachprüfung. Solange sie steht, wird kein Token ausgestellt.`,
        'lib/pilot/send-gate.ts',
        'Die Sperre in pilot_versand_sperre ansehen und mit Begründung aufheben.', kz)
    } else if ((gateVerbraucht ?? 0) > 0) {
      phase('APPROVAL', 'VERIFIED',
        `${gateVerbraucht} Freigabe(n) wurden verbraucht — der Erstversand ist freigegeben gewesen.`,
        'lib/pilot/send-gate.ts', null, kz)
    } else if ((gateOffen ?? 0) > 0) {
      phase('APPROVAL', 'APPROVED',
        `${gateOffen} Freigabe(n) stehen offen und warten auf den Versand.`,
        'lib/pilot/send-gate.ts',
        'Den Versand mit dem Token auslösen, bevor es verfällt.', kz)
    } else if (phasen[0].status === 'READY' || phasen[0].status === 'VERIFIED') {
      phase('APPROVAL', 'READY',
        'Es liegt eine versandfähige Rechnung vor, aber keine Einmal-Freigabe.',
        'lib/pilot/send-gate.ts',
        'Für die ausgewählte Rechnung ein Token erzeugen (erzeugeSendeToken).', kz)
    } else {
      phase('APPROVAL', 'NOT_STARTED',
        'Ohne versandfähige Rechnung gibt es nichts freizugeben.',
        'lib/pilot/send-gate.ts', null, kz)
    }
  }

  // ═══ 3 — SEND ═══
  {
    const gesamtProtokoll = protokollErfolg !== null && protokollFehler !== null && protokollWartend !== null
      ? protokollErfolg + protokollFehler + protokollWartend
      : null
    const kz = [
      kennzahl('Rechnungen mit belegtem sent_at', versendetBelegt, 'Versandzeitpunkt UND Festschreibung — nur so kann der Versandweg ihn gesetzt haben.'),
      kennzahl('Versandzeitpunkt ohne Festschreibung', versendetUnbelegt, 'Belegt keinen Versand; stammt aus einer Einspielung oder einem Direkteingriff.'),
      kennzahl('Protokollzeilen gesamt', gesamtProtokoll, 'Jeder Versuch hinterlässt eine Zeile in invoice_email_log.'),
      kennzahl('Schalter scharf', flags.rechnung.aktiv ? 1 : 0,
        flags.rechnung.aktiv
          ? 'RECHNUNGSVERSAND_AUTOMATISCH ist gesetzt — der Automat verschickt.'
          : flags.rechnung.grund),
    ]
    if (unmessbar(versendet, versendetUnbelegt, gesamtProtokoll)) {
      phase('SEND', 'BLOCKED', 'Versandstand nicht messbar — siehe Hinweise.',
        'lib/billing/versand/rechnung-versand.ts', 'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if ((protokollFehler ?? 0) > 0 && (protokollErfolg ?? 0) === 0) {
      phase('SEND', 'FAILED',
        `${protokollFehler} Versandversuch(e) sind gescheitert, kein einziger erfolgreich.`,
        'lib/billing/versand/rechnung-versand.ts',
        'Die Fehlermeldungen in invoice_email_log.grund lesen, bevor ein weiterer Versuch läuft.', kz)
    } else if ((versendetBelegt ?? 0) > 0) {
      phase('SEND', 'VERIFIED', `${versendetBelegt} festgeschriebene Rechnung(en) tragen sent_at.`,
        'lib/billing/versand/rechnung-versand.ts', null, kz)
    } else if ((versendetUnbelegt ?? 0) > 0) {
      // Der gefährlichste Zustand dieser Phase: es SIEHT versendet aus, ist
      // es aber nachweislich nicht. BLOCKED statt VERIFIED — und mit der
      // Aufforderung, die Herkunft zu klären, bevor irgendetwas rausgeht.
      phase('SEND', 'BLOCKED',
        `${versendetUnbelegt} Rechnung(en) tragen einen Versandzeitpunkt, sind aber nicht `
        + 'festgeschrieben. Der Versandweg weist so eine Rechnung ab — diese Zeitpunkte können '
        + 'nicht von ihm stammen. Solange ihre Herkunft ungeklärt ist, gilt der Versandpfad als '
        + 'NICHT gelaufen.',
        'lib/billing/versand/rechnung-versand.ts',
        'Herkunft der Versandzeitpunkte klären (Einspielung? Direkteingriff?) und entweder '
        + 'bereinigen oder als Altbestand dokumentieren.', kz)
    } else if ((protokollWartend ?? 0) > 0) {
      phase('SEND', 'EXECUTING',
        `${protokollWartend} Versandversuch(e) wurden übersprungen und stehen noch aus.`,
        'lib/billing/versand/rechnung-versand.ts',
        'Grund der Überspringung in invoice_email_log.grund lesen.', kz)
    } else if (phasen[1].status === 'APPROVED') {
      phase('SEND', 'READY', 'Eine Freigabe liegt vor, der Versand ist noch nicht ausgelöst.',
        'lib/billing/versand/rechnung-versand.ts',
        'POST /api/billing/invoices/<id>/versenden mit dem Token.', kz)
    } else {
      phase('SEND', 'NOT_STARTED', 'Noch keine Rechnung versendet. invoice_email_log ist leer.',
        'lib/billing/versand/rechnung-versand.ts', null, kz)
    }
  }

  // ═══ 4 — DELIVERY ═══
  {
    const kz = [
      kennzahl('zugestellt', protokollErfolg, 'Vom Provider angenommen, mit Provider-ID.'),
      kennzahl('fehlgeschlagen', protokollFehler, 'Versuch gescheitert.'),
      kennzahl('übersprungen', protokollWartend, 'Versand hat nicht stattgefunden — z. B. weil ein Schalter aus ist.'),
    ]
    if (unmessbar(protokollErfolg, protokollFehler)) {
      phase('DELIVERY', 'BLOCKED', 'Zustellprotokoll nicht lesbar — siehe Hinweise.',
        'lib/notifications (sendRawEmail) + invoice_email_log', 'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if ((protokollErfolg ?? 0) > 0) {
      phase('DELIVERY', 'VERIFIED',
        `${protokollErfolg} Zustellung(en) mit Provider-Bestätigung protokolliert.`,
        'lib/notifications (sendRawEmail) + invoice_email_log', null, kz)
    } else if ((protokollFehler ?? 0) > 0) {
      phase('DELIVERY', 'FAILED',
        `${protokollFehler} Zustellversuch(e) gescheitert, keiner erfolgreich.`,
        'lib/notifications (sendRawEmail) + invoice_email_log',
        'invoice_email_log.grund lesen — Resend meldet dort den Provider-Fehler.', kz)
    } else if (phasen[2].status === 'VERIFIED') {
      phase('DELIVERY', 'EXECUTING',
        'Rechnungen tragen sent_at, im Protokoll steht aber keine erfolgreiche Zustellung. Entweder läuft der Versand noch, oder es fehlt eine Protokollzeile.',
        'lib/notifications (sendRawEmail) + invoice_email_log',
        'Nachprüfung fahren (pruefeNachVersand) — das ist genau der Fall, den sie findet.', kz)
    } else {
      phase('DELIVERY', 'NOT_STARTED', 'Noch keine Zustellung protokolliert.',
        'lib/notifications (sendRawEmail) + invoice_email_log', null, kz)
    }
  }

  // ═══ 5 — CAMT ═══
  {
    const kz = [
      kennzahl('Importe', camtImporte, 'Verarbeitete Kontoauszüge.'),
      kennzahl('Importe mit Fehler', camtFehler, 'Auszüge, bei denen mindestens eine Buchung nicht angelegt wurde.'),
      kennzahl('Betriebsart scharf', camtModus.buchend ? 1 : 0, camtModus.grund),
    ]
    if (unmessbar(camtImporte, camtFehler)) {
      phase('CAMT', 'BLOCKED', 'Importstand nicht messbar — siehe Hinweise.',
        'app/api/billing/camt/import/route.ts + lib/billing/camt/camt-modus.ts',
        'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if ((camtFehler ?? 0) > 0) {
      phase('CAMT', 'FAILED',
        `${camtFehler} Import(e) stehen auf „fehler" — dort fehlen Buchungen, der Saldo des Auszugs ist unvollständig.`,
        'app/api/billing/camt/import/route.ts',
        'Die betroffenen Auszüge prüfen, bevor weitere importiert werden.', kz)
    } else if ((camtImporte ?? 0) > 0) {
      phase('CAMT', 'VERIFIED', `${camtImporte} Kontoauszug/-züge fehlerfrei importiert.`,
        'app/api/billing/camt/import/route.ts', null, kz)
    } else if (phasen[3].status === 'VERIFIED') {
      phase('CAMT', 'READY',
        `Eine Rechnung ist zugestellt — der Zahlungseingang kann kommen. Betriebsart: ${camtModus.modus}.`,
        'lib/billing/camt/camt-modus.ts + lib/pilot/camt-pilot.ts',
        'Die echte Bankdatei zuerst durch den Pilot-Trockenlauf schicken (camtPilotLauf), erst danach CAMT_IMPORT_MODE=LIVE erwägen.', kz)
    } else {
      phase('CAMT', 'NOT_STARTED',
        'Kein Kontoauszug importiert. Vor dem ersten zugestellten Rechnungsversand gibt es auch keine Zahlung zu erwarten.',
        'app/api/billing/camt/import/route.ts', null, kz)
    }
  }

  // ═══ 6 — MATCH ═══
  {
    const ungeklaert = buchungen !== null && automatisch !== null
      ? Math.max(0, buchungen - automatisch) : null
    const kz = [
      kennzahl('Bankbuchungen', buchungen, 'Zeilen in zahlungseingaenge.'),
      kennzahl('automatisch zugeordnet', automatisch, 'Vom Matching einer Rechnung zugeordnet.'),
      kennzahl('ungeklärt', ungeklaert, 'Weder automatisch zugeordnet noch abgeschlossen.'),
      kennzahl('offene Klärfälle', klaerfaelle, 'Warten auf Zuordnung von Hand.'),
    ]
    if (unmessbar(buchungen, automatisch, klaerfaelle)) {
      phase('MATCH', 'BLOCKED', 'Zuordnungsstand nicht messbar — siehe Hinweise.',
        'lib/billing/matching/matching-engine.ts', 'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if ((buchungen ?? 0) === 0) {
      phase('MATCH', 'NOT_STARTED', 'Keine Bankbuchung vorhanden — es gibt nichts zuzuordnen.',
        'lib/billing/matching/matching-engine.ts', null, kz)
    } else if ((automatisch ?? 0) > 0) {
      phase('MATCH', 'VERIFIED',
        `${automatisch} von ${buchungen} Buchung(en) automatisch zugeordnet, ${klaerfaelle} Klärfall/Klärfälle offen.`,
        'lib/billing/matching/matching-engine.ts',
        (klaerfaelle ?? 0) > 0 ? 'Offene Klärfälle von Hand zuordnen.' : null, kz)
    } else {
      phase('MATCH', 'READY',
        `${buchungen} Buchung(en) eingelesen, keine automatisch zugeordnet. Jede davon ist ein Klärfall.`,
        'lib/billing/matching/matching-engine.ts',
        'Klärfälle ansehen und von Hand zuordnen.', kz)
    }
  }

  // ═══ 7 — ALLOCATION ═══
  {
    const kz = [
      kennzahl('Zuordnungen', zuordnungen, 'Zeilen in payment_allocations. Der DATEV-Export liest genau diese Tabelle.'),
    ]
    if (unmessbar(zuordnungen)) {
      phase('ALLOCATION', 'BLOCKED', 'Zuordnungen nicht messbar — siehe Hinweise.',
        'lib/pilot/allocation-gate.ts + lib/billing/core/payments.ts',
        'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if ((zuordnungen ?? 0) > 0) {
      phase('ALLOCATION', 'VERIFIED', `${zuordnungen} Zahlungszuordnung(en) gebucht.`,
        'lib/pilot/allocation-gate.ts + lib/billing/core/payments.ts', null, kz)
    } else if ((buchungen ?? 0) > 0) {
      phase('ALLOCATION', 'READY',
        'Es liegen Bankbuchungen vor, aber keine Zahlung ist einer Rechnung zugeordnet.',
        'lib/pilot/allocation-gate.ts + lib/billing/core/payments.ts',
        'Gate öffnen (oeffneAllocationGate), Bericht gegenlesen, Token einlösen, dann allocatePayment.', kz)
    } else {
      phase('ALLOCATION', 'NOT_STARTED', 'Keine Zahlung vorhanden — es gibt nichts zu buchen.',
        'lib/pilot/allocation-gate.ts + lib/billing/core/payments.ts', null, kz)
    }
  }

  // ═══ 8 — RECONCILIATION ═══
  {
    const kz = [
      kennzahl('Rechnungen versendet (belegt)', versendetBelegt, 'Ausgangsseite der Kette — nur festgeschriebene Versendungen zählen.'),
      kennzahl('Zuordnungen', zuordnungen, 'Eingangsseite der Kette.'),
    ]
    // Ein Versandzeitpunkt ohne Festschreibung ist keine Ausgangsseite: es
    // gibt weder Beleg noch Protokollzeile, gegen die sich etwas abstimmen
    // liesse.
    const etwasPassiert = (versendetBelegt ?? 0) > 0 || (zuordnungen ?? 0) > 0
    if (unmessbar(versendetBelegt, zuordnungen)) {
      phase('RECONCILIATION', 'BLOCKED', 'Die Eckwerte der Kette sind nicht messbar — eine Abstimmung darauf wäre wertlos.',
        'lib/pilot/reconciliation.ts', 'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if (!etwasPassiert) {
      phase('RECONCILIATION', 'NOT_STARTED',
        'Weder versendet noch zugeordnet — es gibt keine Kette abzustimmen.',
        'lib/pilot/reconciliation.ts', null, kz)
    } else {
      // Ausdrücklich NICHT VERIFIED: das Ergebnis der Abstimmung steht in
      // `stimmeMoneyPathAb()` und wird hier NICHT mitgefahren. Eine Phase,
      // die „geht auf" behauptet, ohne die Abstimmung gerechnet zu haben,
      // wäre die gefährlichste Anzeige auf dieser Seite.
      phase('RECONCILIATION', 'READY',
        'Es gibt eine Kette abzustimmen. Diese Übersicht rechnet die Abstimmung NICHT mit — ihr Ergebnis kommt aus stimmeMoneyPathAb() und wird eigens abgerufen.',
        'lib/pilot/reconciliation.ts',
        'Abstimmung fahren und CONSISTENT / ORPHAN_FOUND / MISMATCH gegenlesen.', kz)
    }
  }

  // ═══ 9 — AUDIT ═══
  {
    const kz = [
      kennzahl('Audit-Einträge', auditZeilen, 'Zeilen in billing_audit_trail für diesen Mandanten.'),
      kennzahl('Vorgänge', versendetBelegt !== null && zuordnungen !== null ? versendetBelegt + zuordnungen : null,
        'Belegt versendete Rechnungen plus Zuordnungen — jede davon muss protokolliert sein.'),
    ]
    const vorgaenge = versendetBelegt !== null && zuordnungen !== null ? versendetBelegt + zuordnungen : null
    if (unmessbar(auditZeilen, vorgaenge)) {
      phase('AUDIT', 'BLOCKED', 'Audit-Trail nicht messbar — siehe Hinweise.',
        'lib/billing/core/audit.ts', 'Die fehlgeschlagene Abfrage nachsehen.', kz)
    } else if ((vorgaenge ?? 0) === 0) {
      phase('AUDIT', 'NOT_STARTED', 'Noch kein Geldvorgang, der zu protokollieren wäre.',
        'lib/billing/core/audit.ts', null, kz)
    } else if ((auditZeilen ?? 0) === 0) {
      phase('AUDIT', 'FAILED',
        `${vorgaenge} Geldvorgang/-vorgänge, aber KEIN einziger Audit-Eintrag. Das ist eine Protokolllücke, kein leerer Anfangszustand.`,
        'lib/billing/core/audit.ts',
        'logAuditEventOrWarn-Pfade prüfen — ein Vorgang ohne Protokollzeile ist nachträglich nicht erklärbar.', kz)
    } else {
      phase('AUDIT', 'VERIFIED',
        `${auditZeilen} Audit-Eintrag/-Einträge zu ${vorgaenge} Geldvorgang/-vorgängen. Ob JEDER Vorgang seinen Eintrag hat, prüft Stufe 9 der Abstimmung — diese Zahl belegt nur, dass protokolliert wird.`,
        'lib/billing/core/audit.ts', null, kz)
    }
  }

  const verifiziert = phasen.filter(p => p.status === 'VERIFIED').length
  const aktuellePhase = phasen.find(p => p.status !== 'VERIFIED') ?? null

  return {
    stichtag: heuteBerlin(),
    organizationId: orgId,
    ausfuehrend: false,
    phasen,
    aktuellePhase,
    fortschritt: {
      verifiziert,
      gesamt: phasen.length,
      prozent: phasen.length === 0 ? 0 : Math.round((verifiziert / phasen.length) * 100),
    },
    versandSperrenDetails,
    hinweise: z.hinweise,
    freigabeHinweis: PHASEN_FREIGABE_HINWEIS,
  }
}
