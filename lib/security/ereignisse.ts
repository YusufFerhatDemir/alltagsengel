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
}

export type Ereignistyp = keyof typeof EREIGNISSE

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
