// ═══════════════════════════════════════════════════════════════════════
// Zustellrueckmeldungen fuer TRANSAKTIONSPOST
// ═══════════════════════════════════════════════════════════════════════
//
// DIE LUECKE, DIE DIESES MODUL SCHLIESST
// app/api/marketing/resend-webhook nimmt Rueckmeldungen von Resend
// entgegen und traegt sie in email_campaign_logs nach. Findet es dort
// keinen Eintrag, antwortet es „Kein Kampagneneintrag zu dieser Kennung —
// nichts zu tun" und verwirft das Ereignis. Der Kommentar dort benennt es
// selbst: Transaktionspost laeuft nicht ueber email_campaign_logs.
//
// Damit fiel bis heute JEDE Rueckmeldung zu Sicherheitsmeldungen,
// Rechnungen und Mahnungen ersatzlos weg. Ein Hard Bounce auf eine
// Sicherheitsmeldung — also genau der Fall „die Warnung hat niemanden
// erreicht" — hinterliess in unserem Bestand nichts. In
// notification_delivery_log stand weiter `sent`, und `sent` heisst nur
// „dem Provider uebergeben".
//
// Seit dem 31.08.2026 steht die Provider-Nachrichten-ID in
// notification_delivery_log.provider_message_id. Der Schluessel, um die
// Rueckmeldung zuzuordnen, ist also da; es hat nur niemand nachgesehen.
//
// ── WARUM KEINE SPERRLISTE ─────────────────────────────────────────────
// Der Marketingweg sperrt eine Adresse bei dauerhaftem Bounce. Fuer
// Transaktionspost waere das genau falsch: eine gesperrte Adresse bekaeme
// dann auch keine Sicherheitsmeldung und keine Rechnung mehr. Man
// verstummte gegenueber der Person, die man erreichen MUSS — und zwar
// stillschweigend.
//
// Transaktionspost wird deshalb nicht gesperrt, sondern LAUT: der
// Bounce wird an der Zustellzeile festgehalten, und bei einer
// gescheiterten Sicherheitsmeldung entsteht ein eigenes
// Sicherheitsereignis. Ein Mensch entscheidet, was mit der Adresse
// passiert.
//
// ── WARUM `failed` UND NICHT `bounced` ─────────────────────────────────
// notification_delivery_log.status traegt einen CHECK:
// queued | sent | delivered | failed | skipped. Ein eigener Wert
// `bounced` braeuchte eine Migration, und DDL ist ueber den
// Dienstschluessel gesperrt (42501). Ein INSERT mit `bounced` schluege
// mit 23514 fehl — die Rueckmeldung waere wieder verloren, diesmal mit
// Fehler statt still. Der Bounce steht deshalb als `failed` plus
// `failed_at` plus Klartext in `sanitized_error`. Die Aussage geht nicht
// verloren, nur der eigene Statuswert.
//
// ── REIHENFOLGE ────────────────────────────────────────────────────────
// Webhooks kommen unsortiert. Der Status wird nur GEHOBEN, nie gesenkt.
// `failed` rangiert dabei ueber `delivered`: trifft nach einem Bounce
// noch ein verspaetetes `delivered` ein, darf es den Bounce nicht
// ueberschreiben.
// ═══════════════════════════════════════════════════════════════════════

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { protokolliereZustellung, type ZustellStatus } from './delivery-log'

const log = logger.child('zustellrueckmeldung')

/** Vorgangsart der Sicherheitsmeldung — hier gespiegelt, um keinen
 *  Ringschluss mit lib/security zu erzeugen. */
export const SICHERHEITSMELDUNG_ART = 'sicherheitsmeldung' as const

/**
 * Rang je Status. Nur ein hoeherer Rang hebt.
 *
 * `failed` steht bewusst GANZ OBEN, nicht unten: eine gescheiterte
 * Zustellung ist die Aussage, auf die es ankommt, und ein verspaetet
 * eintreffendes `delivered` darf sie nicht zudecken. Die Luecken
 * zwischen den Zahlen lassen spaetere Zwischenstufen zu, ohne die
 * bestehenden Werte zu verschieben.
 */
export const RANG: Record<ZustellStatus, number> = {
  queued: 0,
  skipped: 5,
  sent: 20,
  delivered: 30,
  failed: 80,
}

/** Die Ereignisse, die an einer Transaktionszeile etwas aendern. */
export type Rueckmeldung =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.failed'

const ZIEL: Record<Rueckmeldung, ZustellStatus | null> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  // Eine Verzoegerung ist kein Endzustand — die Mail ist weiter
  // unterwegs. Nichts heben, nichts senken.
  'email.delivery_delayed': null,
  'email.bounced': 'failed',
  'email.complained': 'failed',
  'email.failed': 'failed',
}

export function istRueckmeldung(wert: unknown): wert is Rueckmeldung {
  return typeof wert === 'string' && wert in ZIEL
}

/**
 * Klartext fuer `sanitized_error`. Bewusst ohne Rohtext des Providers:
 * eine Bounce-Meldung kann die Empfaengeradresse und Serverinterna
 * enthalten, und dieses Feld wird in der Verwaltungsoberflaeche
 * angezeigt.
 */
export function fehlertext(
  ereignis: Rueckmeldung,
  bounceTyp: string | null | undefined,
): string | null {
  const dauerhaft = String(bounceTyp ?? '').toLowerCase() === 'permanent'
  switch (ereignis) {
    case 'email.bounced':
      return dauerhaft
        ? 'Vom Empfangsserver dauerhaft abgelehnt (Hard Bounce) — Adresse pruefen'
        : 'Vom Empfangsserver voruebergehend abgelehnt (Soft Bounce)'
    case 'email.complained':
      return 'Vom Empfaenger als Spam gemeldet'
    case 'email.failed':
      return 'Versand beim Provider fehlgeschlagen'
    default:
      return null
  }
}

export interface RueckmeldungsErgebnis {
  /** Wurde eine Transaktionszeile gefunden? */
  gefunden: boolean
  /** Wurde tatsaechlich etwas geschrieben? */
  geaendert: boolean
  /** Der Status nach der Verarbeitung. */
  status: ZustellStatus | null
  /** Betroffene Vorgangsart, z. B. 'sicherheitsmeldung'. */
  vorgangArt: string | null
  /** Ist daraus ein Sicherheitsereignis entstanden? */
  eskaliert: boolean
  /** Wurde die Wiederholung dieses Vorgangs beendet (Hard Bounce/Beschwerde)? */
  beendet: boolean
  hinweis: string
}

interface Zeile {
  id: string
  status: string
  recipient: string | null
  organization_id: string | null
  vorgang_art: string | null
  vorgang_ref: string | null
  vorgang_empfaenger: string | null
  // Fuer die Endzustands-Zeile bei dauerhaftem Fehler (siehe unten).
  channel: string | null
  correlation_id: string | null
  notification_id: string | null
  attempt_count: number | null
}

/**
 * Ist diese Rueckmeldung ein ENDZUSTAND — also einer, nach dem ein
 * weiterer Zustellversuch aussichtslos ist?
 *
 * Bewusst eng, nach dem Grundsatz aus fehlerklassen.ts („im Zweifel
 * voruebergehend"):
 *   - Hard Bounce (`bounce.type === 'Permanent'`): die Adresse existiert
 *     nicht. Ein weiterer Versuch kann nicht ankommen.
 *   - Beschwerde: der Empfaenger hat die Mail als Spam gemeldet. Erneut
 *     zu senden ist die schlechteste denkbare Reaktion.
 *
 * NICHT endgueltig sind ein Soft Bounce (Postfach voll, Server gerade
 * weg) und `email.failed` — dort ist die Wiederholung richtig.
 */
export function istEndzustand(
  ereignis: Rueckmeldung,
  bounceTyp: string | null | undefined,
): boolean {
  if (ereignis === 'email.complained') return true
  if (ereignis !== 'email.bounced') return false
  return String(bounceTyp ?? '').toLowerCase() === 'permanent'
}

/**
 * Traegt eine Provider-Rueckmeldung an der Transaktionszeile nach.
 *
 * `eskaliere` wird nur bei einer gescheiterten SICHERHEITSMELDUNG
 * aufgerufen. Sie wird hereingereicht statt importiert, damit dieses
 * Modul nicht von lib/security abhaengt — die Abhaengigkeit laeuft
 * bereits in die andere Richtung (benachrichtigung.ts nutzt die
 * Zustellspur), und ein Ring waere beim naechsten Umbau ein Problem.
 */
export async function verarbeiteTransaktionsRueckmeldung(
  admin: SupabaseClient,
  eingabe: {
    providerNachrichtId: string
    ereignis: Rueckmeldung
    zeitpunkt: string
    bounceTyp?: string | null
  },
  eskaliere?: (zeile: {
    empfaenger: string | null
    organizationId: string | null
    ereignisId: string | null
    userId: string | null
    grund: string
  }) => Promise<void>,
): Promise<RueckmeldungsErgebnis> {
  const nichts = (hinweis: string): RueckmeldungsErgebnis => ({
    gefunden: false, geaendert: false, status: null,
    vorgangArt: null, eskaliert: false, beendet: false, hinweis,
  })

  const { data, error } = await admin
    .from('notification_delivery_log')
    .select(
      'id, status, recipient, organization_id, vorgang_art, vorgang_ref, '
      + 'vorgang_empfaenger, channel, correlation_id, notification_id, attempt_count',
    )
    .eq('provider_message_id', eingabe.providerNachrichtId)
    .maybeSingle()

  if (error) throw new Error(`Zustellzeile nicht lesbar: ${error.message}`)
  if (!data) return nichts('Keine Transaktionszeile zu dieser Kennung.')

  const zeile = data as unknown as Zeile
  const bisher = (zeile.status ?? 'queued') as ZustellStatus
  const ziel = ZIEL[eingabe.ereignis]

  const grundtext = fehlertext(eingabe.ereignis, eingabe.bounceTyp)
  const gescheitert = ziel === 'failed'

  // Nur heben. Ein bereits gescheiterter Vorgang bleibt gescheitert,
  // auch wenn ein verspaetetes `delivered` nachkommt.
  const hebt = !!ziel && (RANG[ziel] ?? 0) > (RANG[bisher] ?? 0)

  const felder: Record<string, unknown> = {}
  if (hebt) felder.status = ziel
  if (gescheitert) {
    // failed_at und der Klartext gehoeren auch dann an die Zeile, wenn
    // der Status schon `failed` war (zweiter Bounce, andere Ursache).
    felder.failed_at = eingabe.zeitpunkt
    if (grundtext) felder.sanitized_error = grundtext
  }

  if (Object.keys(felder).length === 0) {
    return {
      gefunden: true, geaendert: false, status: bisher,
      vorgangArt: zeile.vorgang_art, eskaliert: false, beendet: false,
      hinweis: `Rueckmeldung ${eingabe.ereignis} aendert nichts (Stand: ${bisher}).`,
    }
  }

  // `.select()` ist der Wirkungsnachweis: PostgREST meldet keinen Fehler,
  // wenn NULL Zeilen getroffen wurden.
  const { data: getroffen, error: schreibFehler } = await admin
    .from('notification_delivery_log')
    .update(felder)
    .eq('id', zeile.id)
    .select('id')

  if (schreibFehler) throw new Error(`Zustellzeile nicht schreibbar: ${schreibFehler.message}`)
  if (!getroffen || getroffen.length === 0) {
    log.warn('Zustellrueckmeldung ohne Wirkung geschrieben', { zeile: zeile.id })
  }

  // ── Endzustand: keine weitere Wiederholung ──────────────────────────
  // BEFUND 04.09.2026. Ohne diese Zeile wird eine dauerhaft
  // unzustellbare Adresse WEITER ANGESCHRIEBEN. Der Weg dahin:
  //
  //   1. Der Erstversand schreibt eine Zeile mit status 'sent'.
  //   2. Diese Rueckmeldung hebt genau diese Zeile auf 'failed'.
  //   3. Danach gibt es fuer den Vorgang KEINE 'sent'/'delivered'-Zeile
  //      mehr — und beide Sperren des Wiederholungswegs fragen genau
  //      danach: bereitsZugestellt() (delivery-log.ts) zaehlt
  //      status IN ('sent','delivered'), offeneZustellungen()
  //      (retry.ts) waehlt status IN ('queued','failed') und schliesst
  //      nur Vorgaenge mit einer Erfolgszeile aus.
  //   4. Der Vorgang sieht also wieder „offen" aus und wird erneut
  //      versendet — bis MAX_VERSUCHE erreicht ist.
  //
  // Die Fehlerklassen-Sperre aus retry-worker.ts greift hier NICHT:
  // Resend nimmt den erneuten Auftrag mit 2xx an und meldet den Bounce
  // erst asynchron. Der Versuch gilt damit als 'versendet', nicht als
  // 'fehlgeschlagen' — und nur der fehlgeschlagene Zweig fragt
  // istDauerhaft().
  //
  // Ein Hard Bounce loest deshalb hier einen Endzustand aus: eine
  // 'skipped'-Zeile mit grund 'dauerhaft_fehlgeschlagen'. Genau darauf
  // filtert offeneZustellungen() den Vorgang aus (Dead-Letter-Filter).
  // Kein neuer Statuswert, keine Migration — 'dauerhaft_fehlgeschlagen'
  // steht bereits in notification_delivery_log_grund_check
  // (20260927000000).
  //
  // Die Adresse wird weiterhin NICHT gesperrt (siehe Kopf): der naechste
  // fachliche Vorgang — neue Rechnung, neue Sicherheitsmeldung — hat
  // eine eigene correlation_id und geht wieder raus. Beendet wird nur
  // die Wiederholung DIESES Vorgangs.
  let beendet = false
  if (gescheitert && istEndzustand(eingabe.ereignis, eingabe.bounceTyp)) {
    const ergebnis = await protokolliereZustellung(
      {
        organizationId: zeile.organization_id ?? '',
        correlationId: zeile.correlation_id,
        notificationId: zeile.notification_id,
        vorgangArt: zeile.vorgang_art,
        vorgangRef: zeile.vorgang_ref,
        vorgangEmpfaenger: zeile.vorgang_empfaenger,
        channel: (zeile.channel ?? 'email') as never,
        recipient: zeile.recipient ?? '',
        status: 'skipped',
        grund: 'dauerhaft_fehlgeschlagen',
        fehler: grundtext,
        attemptCount: Math.max(1, zeile.attempt_count ?? 1),
      },
      admin,
    )
    beendet = ergebnis.ok
    if (!ergebnis.ok) {
      // Fail-soft: der Bounce steht bereits an der Zeile. Ein
      // fehlender Endzustand bedeutet nur, dass der Wiederholungslauf
      // es noch einmal versucht — nicht, dass etwas verloren geht.
      log.warn('Endzustand nach dauerhaftem Fehler nicht schreibbar', {
        zeile: zeile.id, grund: ergebnis.grund,
      })
    }
  }

  // ── Eskalation ──────────────────────────────────────────────────────
  // Eine Sicherheitsmeldung, die nicht ankommt, ist selbst ein
  // Sicherheitsvorfall. Sie darf nicht nur als rote Zeile in einer
  // Zustellspur enden, die niemand oeffnet.
  let eskaliert = false
  if (gescheitert && zeile.vorgang_art === SICHERHEITSMELDUNG_ART && eskaliere) {
    try {
      await eskaliere({
        empfaenger: zeile.recipient,
        organizationId: zeile.organization_id,
        ereignisId: zeile.vorgang_ref,
        userId: zeile.vorgang_empfaenger,
        grund: grundtext ?? eingabe.ereignis,
      })
      eskaliert = true
    } catch (err) {
      // Fail-soft: die Rueckmeldung ist bereits festgehalten. Eine
      // gescheiterte Eskalation darf sie nicht zurueckrollen.
      log.errorWithException('Eskalation der gescheiterten Sicherheitsmeldung fehlgeschlagen', err, {
        zeile: zeile.id,
      })
    }
  }

  return {
    gefunden: true,
    geaendert: true,
    status: (felder.status as ZustellStatus) ?? bisher,
    vorgangArt: zeile.vorgang_art,
    eskaliert,
    beendet,
    hinweis: gescheitert
      ? `Zustellung gescheitert: ${grundtext}${beendet ? ' — keine weitere Wiederholung.' : ''}`
      : `Stand auf ${String(felder.status)} gehoben.`,
  }
}
