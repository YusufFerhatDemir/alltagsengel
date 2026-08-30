// ═══════════════════════════════════════════════════════════════════════
// Ereigniskatalog der Sicherheitsspur
// ═══════════════════════════════════════════════════════════════════════
//
// Diese Datei ist die Konfiguration des Audit-Systems: WELCHE Ereignisse
// es gibt, in welche Kategorie sie fallen, wie schwer sie wiegen und
// welche davon eine Mail an ueberwachte Konten ausloesen. Sie ist
// bewusst eine einzige, lesbare Tabelle — die Audit-Konfiguration muss
// nachvollziehbar sein, nicht ueber zehn Dateien verteilt.
//
// GRUNDSATZ: DER KATALOG IST NICHT DER TUERSTEHER
// Ein Ereignistyp, der hier fehlt, wird trotzdem geschrieben. Er landet
// dann in der Kategorie 'security' mit Schweregrad 'warning' — also
// sichtbar. Das ist die Lehre aus dem CHECK auf mis_audit_log.action:
// eine Werteliste, die einen INSERT verhindert, verliert genau die
// Ereignisse, die niemand vorhergesehen hat. Und genau die sind
// interessant.
// ═══════════════════════════════════════════════════════════════════════

/** Schweregrad. Einzige Werteliste mit CHECK in der Datenbank. */
export const SCHWEREGRADE = ['info', 'warning', 'critical'] as const
export type Schweregrad = (typeof SCHWEREGRADE)[number]

/** Kategorie — die grobe Einordnung fuer Filter und Auswertung. */
export const KATEGORIEN = [
  'auth',      // An- und Abmeldung
  'session',   // Sitzungsbeginn/-ende
  'device',    // Geraete
  'role',      // Rollen und Rechte
  'data',      // Aenderung fachlicher Daten
  'security',  // Sicherheitsvorgaenge im engeren Sinn
  'admin',     // Verwaltungshandlungen
] as const
export type Kategorie = (typeof KATEGORIEN)[number]

export interface EreignisRegel {
  kategorie: Kategorie
  /** Vorgabewert; der Aufrufer darf ihn hochsetzen, nicht senken. */
  schweregrad: Schweregrad
  /** Loest bei ueberwachten/privilegierten Konten eine Mail aus. */
  meldepflichtig: boolean
  /** Klartext fuer Oberflaeche und Mail. */
  bezeichnung: string
}

/**
 * Der Katalog.
 *
 * `meldepflichtig` ist die Umsetzung der Vorgabe „Mail bei neuem Login,
 * neuer Session, unbekanntem Geraet, Rechteaenderung, sicherheits-
 * kritischer Aktion, ungewoehnlicher Login-Serie, Aenderung kritischer
 * Daten". Was hier `false` traegt, loest NIE eine Mail aus — auch nicht
 * bei einem ueberwachten Konto. Sonst waere das Postfach nach einem Tag
 * ungelesen, und das ist kein theoretischer Nachteil: eine Meldung, die
 * niemand mehr liest, ist wirkungslos.
 */
export const EREIGNISSE: Readonly<Record<string, EreignisRegel>> = {
  // ── auth ──────────────────────────────────────────────────────────
  login_success: {
    kategorie: 'auth', schweregrad: 'info', meldepflichtig: true,
    bezeichnung: 'Anmeldung erfolgreich',
  },
  login_failed: {
    kategorie: 'auth', schweregrad: 'warning', meldepflichtig: false,
    bezeichnung: 'Anmeldung fehlgeschlagen',
  },
  logout: {
    kategorie: 'auth', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Abmeldung',
  },
  password_reset_requested: {
    kategorie: 'auth', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Passwortzuruecksetzung angefordert',
  },
  password_changed: {
    kategorie: 'auth', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Passwort geaendert',
  },
  mfa_enrolled: {
    kategorie: 'auth', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Zweiter Faktor eingerichtet',
  },
  mfa_removed: {
    kategorie: 'auth', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Zweiter Faktor entfernt',
  },
  mfa_challenge_failed: {
    kategorie: 'auth', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Zweiter Faktor nicht bestanden',
  },

  // ── session ───────────────────────────────────────────────────────
  session_start: {
    kategorie: 'session', schweregrad: 'info', meldepflichtig: true,
    bezeichnung: 'Sitzung begonnen',
  },
  session_end: {
    kategorie: 'session', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Sitzung beendet',
  },

  // App-Start mit bestehender Sitzung. Die native Huelle ist ein
  // WKWebView der Live-Seite — der Server sieht einen gewoehnlichen
  // Seitenaufruf und kann den Start NICHT von einer Navigation
  // unterscheiden. Deshalb meldet die App ihn selbst (Beacon an
  // /api/security/app-start); WER sich meldet, entscheidet dabei nicht
  // die App, sondern die serverseitig gepruefte Sitzung.
  app_start: {
    kategorie: 'session', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'App gestartet',
  },

  // ── device ────────────────────────────────────────────────────────
  unknown_device: {
    kategorie: 'device', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Unbekanntes Geraet',
  },
  device_known: {
    kategorie: 'device', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Bekanntes Geraet',
  },

  // ── role ──────────────────────────────────────────────────────────
  role_change: {
    kategorie: 'role', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Rolle geaendert',
  },
  permission_change: {
    kategorie: 'role', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Berechtigung geaendert',
  },
  org_change: {
    kategorie: 'role', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Organisationszuordnung geaendert',
  },

  // ── data ──────────────────────────────────────────────────────────
  profile_change: {
    kategorie: 'data', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Profil geaendert',
  },
  customer_change: {
    kategorie: 'data', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Kundendaten geaendert',
  },
  employee_change: {
    kategorie: 'data', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Mitarbeiterdaten geaendert',
  },
  // „Aenderung kritischer Daten" aus der Aufgabenstellung. Bankdaten,
  // Tarife und Abrechnungsfreigaben bewegen unmittelbar Geld — deshalb
  // eigener Typ und meldepflichtig, waehrend eine Adressaenderung es
  // nicht ist.
  critical_data_change: {
    kategorie: 'data', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Kritische Daten geaendert',
  },
  // Kontodaten. Getrennt gefuehrt, weil eine Adress- oder
  // Rufnummernaenderung der erste Schritt einer Kontouebernahme ist:
  // wer die Adresse aendert, bekommt danach den
  // Passwort-Zuruecksetzen-Link.
  email_change: {
    kategorie: 'data', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'E-Mail-Adresse geaendert',
  },
  phone_change: {
    kategorie: 'data', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Telefonnummer geaendert',
  },
  account_data_change: {
    kategorie: 'data', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Kontodaten geaendert',
  },
  data_export: {
    kategorie: 'data', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Datenexport',
  },

  // ── security ──────────────────────────────────────────────────────
  security_action: {
    kategorie: 'security', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Sicherheitskritische Aktion',
  },
  blocked_action: {
    kategorie: 'security', schweregrad: 'warning', meldepflichtig: false,
    bezeichnung: 'Aktion abgewiesen',
  },
  security_error: {
    kategorie: 'security', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Sicherheitsfehler',
  },
  // Die „ungewoehnliche Login-Serie" aus der Aufgabenstellung.
  unusual_login_series: {
    kategorie: 'security', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Ungewoehnliche Anmeldeserie',
  },
  // Nachweis, dass eine Meldung rausging. Eigener Typ, damit die
  // Sperrfrist-Abfrage nicht das ausloesende Ereignis mitzaehlt und die
  // Oberflaeche den Versand vom Vorfall unterscheiden kann.
  security_notification_sent: {
    kategorie: 'security', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Sicherheitsmeldung versendet',
  },
  rate_limit_exceeded: {
    kategorie: 'security', schweregrad: 'warning', meldepflichtig: false,
    bezeichnung: 'Ratengrenze ueberschritten',
  },

  // ── Standortfreigabe (TRACK G2) ───────────────────────────────────
  // Das Einschalten ist meldepflichtig, das Ausschalten nicht. Die
  // gefaehrliche Richtung ist genau eine: wer ein fremdes Konto
  // uebernimmt, koennte damit den Aufenthaltsort der Person sichtbar
  // machen — und das muss bei DER PERSON ankommen, nicht nur in einer
  // Liste. Der Widerruf dagegen ist die Handlung, die dieses System
  // ausdruecklich jederzeit erlauben soll; eine Mail dafuer waere eine
  // Bremse ohne Schutzwirkung.
  location_sharing_enabled: {
    kategorie: 'security', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Standortfreigabe eingeschaltet',
  },
  location_sharing_disabled: {
    kategorie: 'security', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Standortfreigabe ausgeschaltet',
  },
  // Ein Standortpunkt, den die Datenbank oder der Anwendungscode
  // abgewiesen hat — weil keine Freigabe aktiv war, weil der gemeldete
  // Modus nicht zur Freigabe passte oder weil im Einsatzmodus kein
  // laufender Einsatz vorlag. Ein einzelner Fall ist ein nachlaufender
  // Client; eine Serie ist ein Befund.
  location_update_rejected: {
    kategorie: 'security', schweregrad: 'warning', meldepflichtig: false,
    bezeichnung: 'Standortmeldung abgewiesen',
  },

  // ── admin ─────────────────────────────────────────────────────────
  admin_action: {
    kategorie: 'admin', schweregrad: 'info', meldepflichtig: false,
    bezeichnung: 'Verwaltungshandlung',
  },
  account_created: {
    kategorie: 'admin', schweregrad: 'warning', meldepflichtig: true,
    bezeichnung: 'Konto angelegt',
  },
  account_deleted: {
    kategorie: 'admin', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Konto geloescht',
  },
  watchlist_change: {
    kategorie: 'admin', schweregrad: 'critical', meldepflichtig: true,
    bezeichnung: 'Ueberwachungsliste geaendert',
  },
  // Wer die Standortkarte oeffnet, hinterlaesst eine Spur — dieselbe
  // Regel wie beim CSV-Export der Sicherheitsspur. Eine Ansicht auf den
  // Aufenthaltsort von Kolleginnen und Kollegen, die niemand nachlesen
  // kann, waere genau die verdeckte Ueberwachung, die dieses Modul
  // ausschliessen soll.
  location_tracking_view: {
    kategorie: 'admin', schweregrad: 'warning', meldepflichtig: false,
    bezeichnung: 'Standortansicht geoeffnet',
  },
}

export type Ereignistyp = keyof typeof EREIGNISSE

// ───────────────────────────────────────────────────────────────────────
// Ueberwachte Konten
// ───────────────────────────────────────────────────────────────────────

/**
 * Der volle Meldesatz fuer ausdruecklich ueberwachte Konten
 * (security_watchlist mit alle_ereignisse = true).
 *
 * ER IST EINE OBERMENGE von `meldepflichtig: true`, keine zweite,
 * konkurrierende Liste. Ein privilegiertes Konto bekommt Meldungen nur
 * fuer die Ereignisse, die im Katalog oben `meldepflichtig` tragen — ein
 * ueberwachtes Konto zusaetzlich fuer die, die im Normalbetrieb zu
 * haeufig sind, um sie jedem zu schicken: jede Abmeldung, jeder
 * Fehlversuch, jeder App-Start.
 *
 * WARUM DAS NICHT EINFACH „ALLES" IST
 * `security_notification_sent` steht bewusst NICHT drin. Eine Meldung
 * ueber eine Meldung erzeugt eine Endlosschleife — die erste Mail
 * schriebe eine Nachweiszeile, die eine zweite Mail ausloeste, und so
 * fort. Auch `device_known` fehlt: es ist der Normalfall jeder
 * Anmeldung und stuende sonst doppelt neben `login_success`.
 */
export const UEBERWACHUNGS_EREIGNISSE: readonly string[] = [
  // Anmeldung und Sitzung
  'login_success',
  'login_failed',
  'logout',
  'session_start',
  'session_end',
  'app_start',
  // Geraet
  'unknown_device',
  // Zugangsdaten
  'password_changed',
  'password_reset_requested',
  'mfa_enrolled',
  'mfa_removed',
  'mfa_challenge_failed',
  // Kontodaten
  'email_change',
  'phone_change',
  'account_data_change',
  'profile_change',
  // Rolle und Rechte
  'role_change',
  'permission_change',
  'org_change',
  // Sicherheit
  'security_action',
  'blocked_action',
  'security_error',
  'unusual_login_series',
  'critical_data_change',
  'data_export',
  'location_sharing_enabled',
  'location_sharing_disabled',
  'location_update_rejected',
  // Verwaltung
  'admin_action',
  'account_created',
  'account_deleted',
  'watchlist_change',
  'location_tracking_view',
]

/** Meldet dieses Ereignis fuer ein ausdruecklich ueberwachtes Konto? */
export function ueberwachungspflichtig(eventType: string): boolean {
  return UEBERWACHUNGS_EREIGNISSE.includes(eventType)
}

/** Regel fuer einen unbekannten Typ: sichtbar, aber nicht meldepflichtig. */
export const UNBEKANNTE_REGEL: EreignisRegel = {
  kategorie: 'security',
  schweregrad: 'warning',
  meldepflichtig: false,
  bezeichnung: 'Unbekanntes Ereignis',
}

export function regelFuer(eventType: string): EreignisRegel {
  return EREIGNISSE[eventType] ?? UNBEKANNTE_REGEL
}

export function istKategorie(wert: unknown): wert is Kategorie {
  return typeof wert === 'string' && (KATEGORIEN as readonly string[]).includes(wert)
}

export function istSchweregrad(wert: unknown): wert is Schweregrad {
  return typeof wert === 'string' && (SCHWEREGRADE as readonly string[]).includes(wert)
}

const RANG: Record<Schweregrad, number> = { info: 0, warning: 1, critical: 2 }

/**
 * Der hoehere von beiden gewinnt. Ein Aufrufer darf ein Ereignis
 * hochstufen („dieser Rollenwechsel war ein Notfall"), aber nie
 * herunterstufen — sonst liesse sich ein kritisches Ereignis am
 * Aufrufort unsichtbar machen.
 */
export function hoechsterSchweregrad(a: Schweregrad, b: Schweregrad): Schweregrad {
  return RANG[a] >= RANG[b] ? a : b
}

export const BEZEICHNUNG_KATEGORIE: Record<Kategorie, string> = {
  auth: 'Anmeldung',
  session: 'Sitzung',
  device: 'Gerät',
  role: 'Rolle & Rechte',
  data: 'Daten',
  security: 'Sicherheit',
  admin: 'Verwaltung',
}

export const BEZEICHNUNG_SCHWEREGRAD: Record<Schweregrad, string> = {
  info: 'Information',
  warning: 'Warnung',
  critical: 'Kritisch',
}
