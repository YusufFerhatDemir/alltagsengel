/**
 * KIM / TI-Anbindung — Versand (Block 18): FAIL-CLOSED
 *
 * Dieses Modul verschickt absichtlich NIEMALS eine KIM-Nachricht und baut
 * NIEMALS eine Verbindung zu einem KIM-Postfach oder der Telematik-
 * infrastruktur (TI) auf.
 *
 * Warum nicht: der eigentliche Versand setzt mehrere Dinge voraus, die uns
 * nicht vorliegen und die wir NICHT aus dem Gedächtnis rekonstruieren dürfen:
 *   - das KIM-Client-Protokoll (Authentifizierung am Postfach, Envelope-
 *     Format, Zustellquittungen) ist gematik-spezifiziert,
 *   - der Versand setzt eine echte Konnektor-Anbindung voraus (Hardware/
 *     Middleware, über die SMC-B/eHBA angesprochen werden),
 *   - die Nutzdaten (z.B. § 302-Abrechnungsdateien) selbst sind an anderer
 *     Stelle bereits gesperrt (lib/abrechnung/sgb-v/generator.ts).
 *
 * Ein geratenes Ergebnis wäre hier am gefährlichsten: ein vermeintlich
 * erfolgreicher „Versand", der in Wahrheit nichts oder etwas Falsches an ein
 * echtes Gesundheitsnetz schickt. Deshalb verweigert diese Funktion die
 * Arbeit bedingungslos — unabhängig vom Status der Konfiguration, der Karte
 * oder der Formatversion.
 *
 * Dasselbe Muster wie lib/abrechnung/sgb-v/generator.ts (SgbVSpecFehltError):
 * die Anforderung ist benannt, der Weg (Konfiguration, Versionsregister,
 * Kartenverwaltung, Warteschlange) vorbereitet, die Ausführung gesperrt.
 *
 * WAS bis dahin nutzbar ist:
 *   - Postfach-Konfiguration    → ./config.ts       (vollständig, kein Connect)
 *   - Formatversionsauflösung   → ./versionen.ts     (vollständig)
 *   - Kartenverwaltung          → ./karten.ts        (vollständig, kein Kartenzugriff)
 *   - Nachrichten-Warteschlange → ./nachrichten.ts   (vollständig, kein Versand)
 *   - Readiness/Blockerliste    → ./readiness.ts
 *
 * ZUM FREISCHALTEN (Reihenfolge):
 *   1. gematik-Zulassung als KIM-Nutzer/Leistungserbringer beschaffen.
 *   2. KIM-Provider-Vertrag abschliessen (liefert Postfachadresse + Zugang).
 *   3. Konnektor-Anbindung (Hardware/Middleware) einrichten, über die
 *      SMC-B/eHBA angesprochen werden — dieses Projekt implementiert kein
 *      eigenes Kartenprotokoll.
 *   4. Technische Anlage 5 (KIM-Client-Spezifikation) beschaffen
 *      (gematik Fachportal) und im Repo als Quelle vermerken.
 *   5. `kim_formatversionen.spec_bestaetigt = true` mit `spec_quelle`
 *      (Dokumentname + Stand) setzen.
 *   6. Versand-Client analog eines eigenen Moduls implementieren (KEIN
 *      direkter Wiederverwendungsversuch fremder Protokollbibliotheken ohne
 *      Prüfung) und die Sperre unten entfernen.
 */
import type { KimFormatVersion } from './versionen'

/**
 * Wird geworfen, wenn ein Versand versucht wird, obwohl die Spezifikation
 * und/oder Infrastruktur fehlt. Eigene Klasse, damit die API-Schicht das von
 * echten Fehlern unterscheiden und als 409/„noch nicht freigeschaltet"
 * beantworten kann.
 */
export class KimSpecFehltError extends Error {
  readonly code = 'KIM_SPEC_FEHLT'
  readonly nachrichtId: string | null
  readonly taVersion: string | null

  constructor(nachrichtId: string | null, taVersion: string | null = null) {
    super(
      `KIM-Versand${nachrichtId ? ` für Nachricht "${nachrichtId}"` : ''}${taVersion ? ` (TA-Version ${taVersion})` : ''} ist gesperrt: ` +
      'weder das KIM-Client-Protokoll noch eine Konnektor-Anbindung liegen vor. ' +
      'Es wird kein Verbindungsversuch zu einem KIM-Postfach oder der TI unternommen — ' +
      'siehe lib/kim/versand.ts für die Freischaltschritte.'
    )
    this.name = 'KimSpecFehltError'
    this.nachrichtId = nachrichtId
    this.taVersion = taVersion
  }
}

export interface KimVersandParams {
  nachrichtId: string
  version: KimFormatVersion | null
}

/**
 * Versucht eine KIM-Nachricht zu versenden.
 *
 * Wirft IMMER — siehe Modul-Kommentar. Doppelte Sperre: selbst wenn eine
 * Formatversion versehentlich auf spec_bestaetigt = true gesetzt wird, fehlt
 * hier weiterhin jede Implementierung eines KIM-Clients oder einer
 * Konnektor-Anbindung. Die Signatur steht schon so, wie sie nach dem
 * Freischalten gebraucht wird, damit Aufrufer (API, Warteschlangen-Worker,
 * Tests) sich nicht ändern müssen.
 */
export function versendeKimNachricht(params: KimVersandParams): never {
  throw new KimSpecFehltError(params.nachrichtId, params.version?.ta_version ?? null)
}

/** Erlaubt der Oberfläche, den Versand-Button zu sperren statt den Nutzer in den Fehler laufen zu lassen. */
export function kimVersandImplementiert(): boolean {
  // Wird true, sobald Schritt 1–6 der Freischaltliste oben erledigt sind.
  return false
}
