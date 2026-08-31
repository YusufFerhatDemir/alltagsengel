// ═══════════════════════════════════════════════════════════════════════════
// ZUSTELLEREIGNISSE — was ein Resend-Webhook mit einer Logzeile macht
//
// Dieses Modul ist bewusst OHNE Datenbank und ohne next/server: die Regel,
// welcher Status welchen ueberschreiben darf, ist die eigentliche Logik und
// muss ohne Supabase pruefbar sein.
//
// ── DAS PROBLEM: EREIGNISSE KOMMEN NICHT IN REIHENFOLGE ────────────────────
//
// Webhooks sind unabhaengige HTTP-Anfragen. `email.delivered` und
// `email.opened` entstehen Sekundenbruchteile auseinander und koennen in
// beliebiger Reihenfolge ankommen; nach einer Zeitueberschreitung wiederholt
// Resend eine Zustellung, und dann kommt ein ALTES Ereignis nach einem
// neuen. Wer den Status einfach setzt, schreibt „zugestellt" ueber
// „geklickt" — und die Kampagnenauswertung zeigt weniger Klicks als es gab.
//
// Das ist derselbe Fehler wie „Upsert stempelt Endzustaende zurueck"
// (monthly_closings, bonus_berechnungen): ein Schreibvorgang, der den
// Bestand nicht liest, kann einen Fortschritt nur verlieren.
//
// ── DIE ANTWORT: EIN RANG, UND NUR VORWAERTS ───────────────────────────────
//
// Jeder Status bekommt einen Rang. Ein Ereignis hebt den Status nur, wenn
// sein Rang HOEHER ist. Zeitstempel dagegen werden IMMER gesetzt, wenn sie
// noch leer sind: `opened_at` ist eine Tatsache ueber diese Mail, unabhaengig
// davon, was der zusammenfassende Status gerade sagt.
//
// ── WARUM UNZUSTELLBAR UEBER GEOEFFNET STEHT ───────────────────────────────
//
// Ein Hard Bounce heisst: die Mail ist nie angekommen. Kaeme davor ein
// „geoeffnet" (etwa von einem Scanner im Mailweg), waere „geoeffnet" die
// falsche Zusammenfassung — die Adresse existiert nicht. Und der Rang
// entscheidet mit darueber, ob die Adresse gesperrt wird.
//
// „abgemeldet" steht ganz oben: das ist eine Willenserklaerung der Person
// und darf von keinem technischen Ereignis ueberschrieben werden.
// ═══════════════════════════════════════════════════════════════════════════

import type { ZustellStatus } from './typen'

/** Die Ereignisarten, die Resend sendet. */
export const WEBHOOK_EREIGNISSE = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
  'email.failed',
] as const
export type WebhookEreignis = (typeof WEBHOOK_EREIGNISSE)[number]

export function istWebhookEreignis(wert: unknown): wert is WebhookEreignis {
  return typeof wert === 'string' && (WEBHOOK_EREIGNISSE as readonly string[]).includes(wert)
}

/**
 * Der Rang je Status. Nur ein hoeherer Rang darf den Status heben.
 *
 * Die Luecken zwischen den Zahlen sind Absicht: ein spaeter ergaenzter
 * Zwischenstatus laesst sich einsortieren, ohne die bestehenden Werte zu
 * verschieben (die stehen sonst in Auswertungen und Tests fest).
 */
export const RANG: Record<ZustellStatus, number> = {
  geplant: 0,
  fehler: 10,
  gesendet: 20,
  zugestellt: 30,
  geoeffnet: 40,
  geklickt: 50,
  unzustellbar: 80,
  abgemeldet: 90,
}

/** Welchen Status ein Ereignis anstrebt. `null`: kein Statuswechsel. */
const ZIEL: Record<WebhookEreignis, ZustellStatus | null> = {
  'email.sent': 'gesendet',
  'email.delivered': 'zugestellt',
  // Eine Verzoegerung ist kein Endzustand — die Mail ist weiter unterwegs.
  // Sie zu „fehler" zu machen, waere eine falsche Aussage.
  'email.delivery_delayed': null,
  'email.opened': 'geoeffnet',
  'email.clicked': 'geklickt',
  'email.bounced': 'unzustellbar',
  'email.complained': 'abgemeldet',
  'email.failed': 'fehler',
}

/** Die Zeitstempelspalte, die ein Ereignis fuellt. */
const ZEITSPALTE: Record<WebhookEreignis, string | null> = {
  'email.sent': 'sent_at',
  'email.delivered': 'delivered_at',
  'email.delivery_delayed': null,
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'bounced_at',
  'email.complained': 'unsubscribed_at',
  'email.failed': null,
}

export interface Bestand {
  status: ZustellStatus
  sent_at: string | null
  delivered_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  unsubscribed_at: string | null
}

export interface Aenderung {
  /** Die Felder fuer das UPDATE. Leer heisst: nichts zu tun. */
  felder: Record<string, string>
  /** Ob der Status gehoben wird (fuer das Protokoll). */
  statusGehoben: boolean
}

/**
 * Berechnet das UPDATE fuer ein Ereignis.
 *
 * @param bestand Der GELESENE Zustand der Zeile. Ohne ihn liesse sich
 *                nicht entscheiden, ob das Ereignis ein Fortschritt ist.
 * @param zeitpunkt ISO-Zeitstempel des Ereignisses.
 */
export function berechneAenderung(
  ereignis: WebhookEreignis,
  bestand: Bestand,
  zeitpunkt: string,
): Aenderung {
  const felder: Record<string, string> = {}

  // 1) Zeitstempel — Tatsachen, unabhaengig vom Status. Nur wenn noch
  //    leer: der ERSTE Zeitpunkt ist der interessante, und eine
  //    Wiederholung derselben Zustellung darf ihn nicht verschieben.
  const spalte = ZEITSPALTE[ereignis]
  if (spalte && !bestand[spalte as keyof Bestand]) {
    felder[spalte] = zeitpunkt
  }

  // 2) Der CHECK email_campaign_logs_gesendet_braucht_zeit verlangt bei
  //    jedem Status ausser 'geplant'/'fehler' ein gesetztes sent_at.
  //    Fehlt es — etwa weil das Ereignis vor dem Abschluss des eigenen
  //    Schreibvorgangs eintraf —, wuerde das UPDATE sonst scheitern und
  //    das Ereignis waere verloren.
  const ziel = ZIEL[ereignis]
  const hebt = ziel !== null && RANG[ziel] > RANG[bestand.status]

  if (hebt && ziel !== 'fehler' && !bestand.sent_at && !felder.sent_at) {
    felder.sent_at = zeitpunkt
  }

  if (hebt) felder.status = ziel

  return { felder, statusGehoben: hebt }
}

/**
 * Fuehrt ein Ereignis zu einem Sperreintrag — und mit welchem Grund?
 *
 * NUR dauerhafte Fehler und Beschwerden. Ein voruebergehender Bounce
 * (Postfach voll, Server kurz nicht erreichbar) darf KEINE Sperre
 * ausloesen: die Adresse ist gueltig, und eine Sperre daraus waere ein
 * dauerhafter Verlust wegen eines voruebergehenden Zustands.
 *
 * @param bounceTyp `data.bounce.type` aus dem Rumpf ('Permanent' /
 *                  'Transient'). Unbekannt oder fehlend gilt als NICHT
 *                  dauerhaft — im Zweifel nicht sperren.
 */
export function sperrgrundFuer(
  ereignis: WebhookEreignis,
  bounceTyp: string | null | undefined,
): 'hard_bounce' | 'spam_beschwerde' | null {
  if (ereignis === 'email.complained') return 'spam_beschwerde'
  if (ereignis !== 'email.bounced') return null
  return String(bounceTyp ?? '').toLowerCase() === 'permanent' ? 'hard_bounce' : null
}
