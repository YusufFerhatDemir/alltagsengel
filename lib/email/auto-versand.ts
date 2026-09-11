import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { sendEmailNotificationErgebnis } from '@/lib/notifications'
import { logger } from '@/lib/logger'
import { vorlageFinden, vorlageRendern } from './templates'

const log = logger.child('email:auto')

// ═══════════════════════════════════════════════════════════════════════
// AUTOMATISCHE TRANSAKTIONALE BESTÄTIGUNGEN
//
// Wer ein Formular abschickt, bekommt sofort eine Bestätigung. Das ist
// eine transaktionale Nachricht — die Antwort auf eine Handlung, die der
// Empfänger gerade selbst ausgelöst hat, keine Werbung. Sie braucht keine
// Marketing-Einwilligung und darf nicht auf einen Verwaltungsklick warten.
//
// ── DREI EIGENSCHAFTEN, DIE HIER ZÄHLEN ───────────────────────────────
//
// IDEMPOTENT. Vor jedem Versand wird `notification_delivery_log` gefragt,
// ob für denselben Vorgang schon eine Mail rausging. Ein wiederholter
// Request, ein Doppelklick oder ein Retry erzeugt damit keine zweite Mail.
// Der Riegel liegt in der Datenbank, nicht im Anwendungszustand — eine
// Prüfung im Speicher überlebt keinen zweiten Serverless-Aufruf.
//
// PROTOKOLLIERT. Jeder Versuch landet über den ZustellKontext in der
// Zustellspur: Kanal, Empfänger, Status, Provider-Kennung, Fehler. Ohne
// `vorgangArt`/`vorgangRef` könnte der Wiederholungslauf eine gescheiterte
// Zustellung nie erneut versuchen — die correlation_id ist ein Hash.
//
// BRICHT NIE DEN VORGANG AB. Scheitert der Versand, bleibt die Vormerkung
// bzw. Bewerbung bestehen. Die Vormerkung ist das Wertvolle; eine
// Bestätigung lässt sich nachholen, ein verlorener Interessent nicht.
//
// ── NOTAUS ────────────────────────────────────────────────────────────
// `AUTO_BESTAETIGUNG_AUS=1` schaltet den automatischen Versand ab, ohne
// dass jemand deployen muss. Bewusst ein Aus- und kein Einschalter: der
// gewollte Zustand ist „an", und ein vergessenes Flag darf nicht dazu
// führen, dass wochenlang niemand eine Bestätigung bekommt.
// ═══════════════════════════════════════════════════════════════════════

export interface AutoBestaetigung {
  vorlageId: string
  empfaengerEmail: string
  empfaengerName: string
  /**
   * Bezeichner-Slug des Vorgangs, z. B. 'warteliste-bestaetigung'.
   *
   * NUR Kleinbuchstaben, Ziffern und BINDESTRICHE — `slugOderNull()` in
   * lib/notifications/delivery-log.ts prueft gegen /^[a-z][a-z0-9-]{2,39}$/
   * und verwirft alles andere STILL auf NULL. Ein Unterstrich kostet damit
   * nicht die Protokollzeile, wohl aber ihre Zuordnung — und die
   * Idempotenzpruefung unten findet dann nie etwas.
   */
  vorgangArt: string
  /** Fachliche Datensatz-ID (state_waitlist.id / lead_inquiries.id). */
  vorgangRef: string
  werte: Record<string, string>
}

export type AutoErgebnis =
  | { gesendet: true; providerId: string | null }
  | { gesendet: false; grund: 'abgeschaltet' | 'bereits_gesendet' | 'vorlage_unbekannt' | 'unvollstaendig' | 'fehler'; meldung?: string }

function abgeschaltet(): boolean {
  return process.env.AUTO_BESTAETIGUNG_AUS === '1'
}

/**
 * Ging für diesen Vorgang schon eine E-Mail raus?
 *
 * Fail-OPEN, und das ist hier die richtige Richtung: Lässt sich die
 * Zustellspur nicht lesen, wird gesendet. Die Alternative wäre, bei einer
 * gestörten Abfrage gar keine Bestätigung zu schicken — eine doppelte
 * Bestätigung ist ärgerlich, eine fehlende kostet den Vorgang.
 */
async function bereitsGesendet(vorgangArt: string, vorgangRef: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('notification_delivery_log')
      .select('id')
      .eq('vorgang_art', vorgangArt)
      .eq('vorgang_ref', vorgangRef)
      .eq('channel', 'email')
      .in('status', ['sent', 'delivered'])
      .limit(1)

    if (error) {
      log.warn(`Idempotenzpruefung nicht moeglich (${error.code}: ${error.message}) — es wird gesendet.`)
      return false
    }
    return (data?.length ?? 0) > 0
  } catch (err) {
    log.errorWithException('Idempotenzpruefung fehlgeschlagen — es wird gesendet.', err)
    return false
  }
}

/**
 * Sendet die Bestätigung. Wirft nicht — der Aufrufer soll weiterlaufen.
 */
export async function sendeAutomatischeBestaetigung(
  eingabe: AutoBestaetigung,
): Promise<AutoErgebnis> {
  if (abgeschaltet()) {
    log.warn(`Auto-Bestaetigung ${eingabe.vorlageId} uebersprungen: AUTO_BESTAETIGUNG_AUS=1.`)
    return { gesendet: false, grund: 'abgeschaltet' }
  }

  const vorlage = vorlageFinden(eingabe.vorlageId)
  if (!vorlage) {
    log.error(`Unbekannte Vorlage: ${eingabe.vorlageId}`)
    return { gesendet: false, grund: 'vorlage_unbekannt' }
  }

  const gerendert = vorlageRendern(vorlage, eingabe.werte)
  if (gerendert.fehlendeFelder.length > 0) {
    // Fail-closed: eine Mail mit Lücke ist beim Empfänger schlimmer als
    // keine. Die Verwaltung kann sie über den Dialog nachholen.
    log.error(
      `Auto-Bestaetigung ${eingabe.vorlageId} nicht gesendet — Pflichtangaben fehlen: `
      + gerendert.fehlendeFelder.join(', '),
    )
    return { gesendet: false, grund: 'unvollstaendig', meldung: gerendert.fehlendeFelder.join(', ') }
  }

  if (await bereitsGesendet(eingabe.vorgangArt, eingabe.vorgangRef)) {
    log.warn(`Auto-Bestaetigung ${eingabe.vorlageId} uebersprungen: fuer ${eingabe.vorgangRef} lag schon eine Zustellung vor.`)
    return { gesendet: false, grund: 'bereits_gesendet' }
  }

  try {
    const ergebnis = await sendEmailNotificationErgebnis(
      eingabe.empfaengerEmail,
      eingabe.empfaengerName || 'Alltagsengel',
      gerendert.betreff,
      gerendert.rumpfHtml,
      {
        organizationId: DEFAULT_ORG_ID,
        vorgangArt: eingabe.vorgangArt,
        vorgangRef: eingabe.vorgangRef,
      },
    )

    if (ergebnis.ok) {
      log.info(`Auto-Bestaetigung ${eingabe.vorlageId} gesendet (${ergebnis.messageId}).`)
      return { gesendet: true, providerId: ergebnis.messageId }
    }

    // Der Wiederholungslauf (cron/zustellung-retry) findet die Zeile über
    // vorgangArt/vorgangRef und versucht es erneut — deshalb ist der
    // Fehler hier kein Endzustand.
    log.error(`Auto-Bestaetigung ${eingabe.vorlageId} fehlgeschlagen: ${ergebnis.grund}`)
    return { gesendet: false, grund: 'fehler', meldung: ergebnis.grund }
  } catch (err) {
    log.errorWithException(`Auto-Bestaetigung ${eingabe.vorlageId} fehlgeschlagen`, err)
    return { gesendet: false, grund: 'fehler' }
  }
}

/** Erster Vorname aus einem vollen Namen — für die Anrede in den Vorlagen. */
export function vornameAus(name: string | null | undefined): string {
  if (!name) return ''
  return name.trim().split(/\s+/)[0] ?? ''
}
