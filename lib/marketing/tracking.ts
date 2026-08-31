// ═══════════════════════════════════════════════════════════════════════════
// ÖFFNUNGS- UND KLICKTRACKING — was gespeichert werden DARF
//
// ── DER BEFUND VOM 31.08.2026 ──────────────────────────────────────────────
// Der Resend-Webhook schrieb `opened_at` und `clicked_at` bedingungslos in
// `email_campaign_logs` und in die Zustellspur — fuer Werbepost UND fuer
// Transaktionspost. Es gab keinen Schalter, keine Einwilligung und keine
// Stelle, an der jemand haette sagen koennen „das nicht".
//
// Warum das nicht nur eine fehlende Einstellung ist:
//
//   * `opened_at` je Person ist die Aussage „diese namentlich bekannte
//     Person hat diese Mail zu diesem Zeitpunkt geoeffnet". Das ist eine
//     Verhaltensbeobachtung, keine Zustellinformation. Nach Auffassung der
//     Datenschutzkonferenz braucht die individualisierte Messung von
//     Oeffnungen und Klicks eine eigene Einwilligung; die Einwilligung in
//     den Newsletter deckt sie nicht mit ab.
//   * Bei RECHNUNGEN und SICHERHEITSMELDUNGEN ist sie ohnehin unzulaessig:
//     dort gibt es gar keine Einwilligung, auf die man sich stuetzen
//     koennte, und die Mail muss auch ohne Messung ihren Zweck erfuellen.
//
// ── WAS DIESES MODUL KANN — UND WAS NICHT ──────────────────────────────────
// Es entscheidet, ob ein eingehendes Oeffnungs-/Klickereignis GESPEICHERT
// wird. Das ist die Haelfte, die uns gehoert.
//
// Die andere Haelfte gehoert dem Versanddienst: OB Resend ueberhaupt ein
// Zaehlpixel einbaut und Links umschreibt, ist eine Einstellung an der
// Domain (open_tracking / click_tracking) und laesst sich ueber die
// Sende-API NICHT je Mail abschalten. Dieses Modul kann also verhindern,
// dass wir die Daten AUFBEWAHREN — nicht, dass sie entstehen.
//
// Deshalb gehoert beides zusammen:
//   1. Hier: fail-closed, ohne Schalter wird nichts gespeichert.
//   2. Dort: die Domain-Einstellung muss aus sein. `npm run verify:tracking`
//      liest sie bei Resend nach und meldet, was wirklich eingestellt ist.
//      Ein Schalter, der nur bei uns steht, waere eine Beruhigung ohne
//      Deckung.
//
// ── DER SCHALTER ───────────────────────────────────────────────────────────
// `MARKETING_TRACKING_ERLAUBT=1`. Nicht gesetzt heisst NEIN — und das ist
// der richtige Standardwert: eine Messung, die niemand angeordnet hat,
// findet nicht statt.
// ═══════════════════════════════════════════════════════════════════════════

/** Die beiden Ereignisse, um die es geht. */
export const TRACKING_EREIGNISSE = ['email.opened', 'email.clicked'] as const
export type TrackingEreignis = (typeof TRACKING_EREIGNISSE)[number]

export function istTrackingEreignis(wert: unknown): wert is TrackingEreignis {
  return typeof wert === 'string' && (TRACKING_EREIGNISSE as readonly string[]).includes(wert)
}

export interface TrackingLage {
  /** Darf ein Oeffnungs-/Klickereignis gespeichert werden? */
  erlaubt: boolean
  /** Ein Satz fuer Protokoll und Oberflaeche. */
  grund: string
}

/**
 * Die Lage fuer WERBEPOST.
 *
 * `env` wird hereingereicht, damit die Regel ohne Prozessumgebung
 * pruefbar ist — dieselbe Bauart wie bei den uebrigen Versandtoren.
 */
export function trackingLage(env: NodeJS.ProcessEnv = process.env): TrackingLage {
  const an = env.MARKETING_TRACKING_ERLAUBT === '1'
  return {
    erlaubt: an,
    grund: an
      ? 'MARKETING_TRACKING_ERLAUBT=1 — Öffnungs- und Klickzeitpunkte werden gespeichert. '
        + 'Die Einwilligung dafür muss vorliegen; die Domain-Einstellung bei Resend '
        + 'entscheidet zusätzlich, ob überhaupt gemessen wird.'
      : 'MARKETING_TRACKING_ERLAUBT ist nicht gesetzt: Öffnungs- und Klickzeitpunkte '
        + 'werden NICHT gespeichert. Die Zustellung selbst (gesendet, zugestellt, '
        + 'unzustellbar, Beschwerde) wird davon nicht berührt.',
  }
}

/**
 * Die Lage fuer TRANSAKTIONSPOST — Rechnungen, Mahnungen,
 * Sicherheitsmeldungen.
 *
 * IMMER nein, ohne Schalter. Es gibt hier keine Einwilligung, auf die
 * sich eine Verhaltensmessung stuetzen liesse, und es soll auch keinen
 * Schalter geben, der das versehentlich aendert. Eine Rechnung muss
 * ankommen — ob sie geoeffnet wurde, geht uns nichts an.
 */
export function trackingLageTransaktion(): TrackingLage {
  return {
    erlaubt: false,
    grund: 'Transaktionspost wird nicht auf Öffnungen und Klicks gemessen. Dafür gibt es '
      + 'keine Einwilligung, und die Mail erfüllt ihren Zweck auch ohne die Messung.',
  }
}

/**
 * Filtert die Felder eines Zustell-Updates.
 *
 * Bewusst als NACHGELAGERTER Filter und nicht als Bedingung mitten in
 * `berechneAenderung()`: die Rangfolge der Zustellstaende bleibt damit
 * unberuehrt, und es gibt genau eine Stelle, an der Tracking-Felder
 * entfernt werden. Eine Bedingung an fuenf Stellen waere genau die Art
 * Regel, die beim naechsten Ereignistyp vergessen wird.
 */
export const TRACKING_FELDER = ['opened_at', 'clicked_at'] as const

export interface FilterErgebnis {
  felder: Record<string, string>
  /** Welche Felder verworfen wurden — fuer das Protokoll, nicht fuer die Antwort. */
  verworfen: string[]
}

export function ohneTrackingFelder(
  felder: Record<string, string>,
  lage: TrackingLage,
): FilterErgebnis {
  if (lage.erlaubt) return { felder, verworfen: [] }

  const gefiltert: Record<string, string> = {}
  const verworfen: string[] = []
  for (const [k, v] of Object.entries(felder)) {
    if ((TRACKING_FELDER as readonly string[]).includes(k)) verworfen.push(k)
    else gefiltert[k] = v
  }
  return { felder: gefiltert, verworfen }
}
