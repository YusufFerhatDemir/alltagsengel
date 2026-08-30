// ═══════════════════════════════════════════════════════════════════════
// Rollen- und Berechtigungsmodell (Least Privilege)
// ═══════════════════════════════════════════════════════════════════════
//
// EINE Quelle der Wahrheit fuer die Frage „darf diese Rolle das?".
// Dieselbe Matrix existiert als SQL-Funktion public.darf() (Migration
// 20260924000000) — beide muessen zusammen geaendert werden, sonst darf
// jemand ueber die API mehr als ueber die Datenbank oder umgekehrt.
// Der Regressionstest __tests__/security/rollenkonzept.test.ts prueft
// beide Seiten gegeneinander.
//
// AUSGANGSLAGE VOR DIESEM MODUL
// Es gab genau zwei Stufen: „admin/superadmin" und „alles andere".
// Dreizehn Guards (lib/*/api-auth.ts) trugen jeweils ein hart
// verdrahtetes ['admin','superadmin'] und is_admin() entschied in RLS
// ueber Bankdaten, Gesundheitsdaten, Tarife und Audit-Logs gleichermassen.
// Wer die Buchhaltung machen sollte, brauchte damit zwangslaeufig Zugriff
// auf Pflegedokumentation — und wer die Pflegedokumentation fuehrte,
// konnte Tarife aendern.
//
// GRUNDSAETZE
//  1. Verweigern ist der Normalfall. Eine Rolle, die in ROLLEN_MATRIX
//     keine Berechtigung eingetragen hat, bekommt nichts. Neue Rollen
//     starten leer, nicht als Admin.
//  2. Die Rolle kommt NIE aus user_metadata. Sie ist dort vom Nutzer
//     selbst schreibbar (supabase.auth.updateUser). Autoritativ sind
//     app_metadata.role (nur serverseitig setzbar) und profiles.role
//     (per DB-Trigger gegen Selbstbefoerderung geschuetzt).
//  3. Besonders geschuetzt und deshalb NUR fuer admin/superadmin:
//     Tarifaenderungen, Benutzerverwaltung und Systemeinstellungen.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Alle Rollen, die public.profiles.role annehmen darf.
 *
 * 'angehoerige' ist bewusst so geschrieben (nicht 'angehoeriger'):
 * 'angehoeriger' ist im Bestand schon vergeben — als Beziehungsart in
 * angehoerigen_zugaenge.rolle ('angehoeriger' | 'betreuer' |
 * 'bevollmaechtigter'). Zwei Bedeutungen unter einem Wort waeren in einer
 * Berechtigungsmatrix eine Falle; deshalb bleibt die Kontorolle
 * 'angehoerige' und die Beziehungsart 'angehoeriger'.
 */
export const ROLLEN = [
  'superadmin',
  'admin',
  'pdl',
  'qm',
  'buchhaltung',
  'engel',
  'fahrer',
  'kunde',
  'angehoerige',
] as const

export type Rolle = (typeof ROLLEN)[number]

export function istRolle(wert: unknown): wert is Rolle {
  return typeof wert === 'string' && (ROLLEN as readonly string[]).includes(wert)
}

/** Anzeigename fuer die Oberflaeche. */
export const ROLLEN_BEZEICHNUNG: Record<Rolle, string> = {
  superadmin: 'Superadministration',
  admin: 'Administration',
  pdl: 'Pflegedienstleitung',
  qm: 'Qualitätsmanagement',
  buchhaltung: 'Buchhaltung',
  engel: 'Engel',
  fahrer: 'Fahrdienst',
  kunde: 'Kundschaft',
  angehoerige: 'Angehörige',
}

// ───────────────────────────────────────────────────────────────────────
// Berechtigungen
// ───────────────────────────────────────────────────────────────────────

export const BERECHTIGUNGEN = [
  // Klienten-Stammdaten (Name, Adresse, Vertrag, Budget)
  'stammdaten.lesen',
  'stammdaten.schreiben',
  // Personal (Mitarbeitende, Qualifikationen, Dienstplan, Urlaub, Gespräche)
  'personal.lesen',
  'personal.schreiben',
  // Einsatzgeschehen (Touren, Termine, Leistungsnachweise, Zeiterfassung)
  'einsatz.lesen',
  'einsatz.schreiben',
  // Gesundheitsdaten (Pflegedoku, SIS, Wunden, Vitalwerte, Medikamente)
  'pflege.lesen',
  'pflege.schreiben',
  // Qualitätssicherung (Prüfprotokolle, Fristen, Eskalationen, Beschwerden)
  'qm.lesen',
  'qm.schreiben',
  // Abrechnung (Rechnungen, Gutschriften, Mahnwesen, offene Posten)
  'abrechnung.lesen',
  'abrechnung.schreiben',
  // Bankverbindungen und SEPA-Mandate
  'bankdaten.lesen',
  'bankdaten.schreiben',
  // Preis- und Tarifkataloge
  'tarife.lesen',
  'tarife.schreiben',
  // Revisionsspuren
  'audit.lesen',
  // Sicherheitsspur: Anmeldungen, Geraete, IP-Adressen, Rechteaenderungen
  // (security_audit_log). Bewusst GETRENNT von 'audit.lesen': die
  // fachliche Revisionsspur brauchen pdl, qm und buchhaltung fuer ihre
  // Arbeit. Die Sicherheitsspur enthaelt daneben das Anmeldeverhalten
  // von Kolleginnen und Kollegen — Material zur Mitarbeiterueberwachung,
  // das in keine Fachrolle gehoert. Deshalb Vorbehalt der Administration
  // (NUR_ADMINISTRATION, siehe lib/security/).
  'sicherheit.lesen',
  // Konten, Rollen, Passwortzurücksetzung
  'benutzer.verwalten',
  // Systemeinstellungen, Feature-Flags, Schnittstellen (KIM/FHIR/Sync)
  'system.verwalten',
  // Auswertungen und Kennzahlen
  'berichte.lesen',
  // Bonusregeln, Berechnungslaeufe und Freigaben (Block 19).
  // Eigene Berechtigung, weil hier ueber die VERGUETUNG von Mitarbeitenden
  // entschieden wird: wer die Regel schreibt, bestimmt wer Geld bekommt,
  // und wer freigibt, loest die Zahlung aus. Die Datenbank sieht das
  // genauso — saemtliche bonus_*-Policies stehen live auf is_admin(),
  // also admin|superadmin. Ohne eigene Berechtigung liefe die
  // Schnittstelle der Datenbank voraus (siehe lib/analytics/bonus-auth.ts).
  'bonus.verwalten',
  // Werbepost: Verteiler, Kampagnen, Einwilligungen, Sperrliste (Block 20).
  // Eigene Berechtigung, weil hier ueber die AUSSENWIRKUNG gegenueber der
  // gesamten Kundschaft entschieden wird: wer eine Kampagne freigibt,
  // schreibt in einem Zug jeden Empfaenger im Segment an — und eine
  // rausgegangene Mail holt niemand zurueck. Dazu kommt die
  // Einwilligungsverwaltung: wer sie aendern kann, kann die Grundlage
  // erzeugen, auf die er sich beim Versand beruft. Beides zusammen ist
  // ein Vorbehalt der Administration, kein Fachrecht (siehe
  // NUR_ADMINISTRATION und lib/marketing/api-auth.ts).
  'marketing.verwalten',
] as const

export type Berechtigung = (typeof BERECHTIGUNGEN)[number]

/**
 * Berechtigungen, die ausschliesslich der Administration zustehen.
 *
 * Sie stehen hier nicht aus Bequemlichkeit, sondern weil ein Missbrauch
 * unmittelbar Geld oder Zugang bewegt: wer Tarife aendert, aendert jede
 * kuenftige Rechnung; wer Benutzer verwaltet, kann sich selbst jede
 * andere Rolle geben; wer Systemeinstellungen aendert, kann Sperren
 * ausschalten. Der Test wacht darueber, dass hier nie eine Fachrolle
 * hinzukommt.
 */
export const NUR_ADMINISTRATION: readonly Berechtigung[] = [
  'tarife.schreiben',
  'benutzer.verwalten',
  'system.verwalten',
  'bonus.verwalten',
  'marketing.verwalten',
  'sicherheit.lesen',
]

// ───────────────────────────────────────────────────────────────────────
// Matrix
// ───────────────────────────────────────────────────────────────────────

const ALLE: readonly Berechtigung[] = BERECHTIGUNGEN

/**
 * Wer darf was. Fehlt eine Berechtigung, ist sie verweigert — es gibt
 * keinen Vererbungsmechanismus und keine Platzhalter.
 */
export const ROLLEN_MATRIX: Record<Rolle, readonly Berechtigung[]> = {
  superadmin: ALLE,
  admin: ALLE,

  // Pflegedienstleitung: fuehrt den Betrieb. Sieht und aendert Klienten,
  // Personal, Einsaetze und Pflegedokumentation, verantwortet die
  // Qualitaetssicherung. Rechnungen darf sie einsehen (Rueckfragen aus
  // dem Betrieb), aber nicht erzeugen oder aendern. Bankdaten,
  // Tarifpflege, Benutzer- und Systemverwaltung: nein.
  pdl: [
    'stammdaten.lesen', 'stammdaten.schreiben',
    'personal.lesen', 'personal.schreiben',
    'einsatz.lesen', 'einsatz.schreiben',
    'pflege.lesen', 'pflege.schreiben',
    'qm.lesen', 'qm.schreiben',
    'abrechnung.lesen',
    'tarife.lesen',
    'audit.lesen',
    'berichte.lesen',
  ],

  // Qualitaetsmanagement: prueft, dokumentiert Befunde, aendert aber die
  // geprueften Daten NICHT — sonst pruefte es die eigene Korrektur.
  // Schreibrecht nur im eigenen QM-Bestand.
  qm: [
    'stammdaten.lesen',
    'personal.lesen',
    'einsatz.lesen',
    'pflege.lesen',
    'qm.lesen', 'qm.schreiben',
    'audit.lesen',
    'berichte.lesen',
  ],

  // Buchhaltung: Rechnungen, Zahlungen, Mahnwesen, Bankverbindungen.
  // Braucht die Klienten-Stammdaten als Rechnungsempfaenger und die
  // Leistungsnachweise als Rechnungsgrundlage — aber KEINE
  // Gesundheitsdaten und keine Personalakten. Tarife nur lesen: eine
  // Tarifaenderung ist eine Preisentscheidung, keine Buchung.
  buchhaltung: [
    'stammdaten.lesen',
    'einsatz.lesen',
    'abrechnung.lesen', 'abrechnung.schreiben',
    'bankdaten.lesen', 'bankdaten.schreiben',
    'tarife.lesen',
    'audit.lesen',
    'berichte.lesen',
  ],

  // Die folgenden Rollen haben KEINE Verwaltungsberechtigungen. Ihr
  // Zugriff auf die eigenen Daten laeuft ausschliesslich ueber RLS
  // (eigene_caregiver_ids(), Klienten-Zuordnung, Angehoerigenzugang) —
  // nicht ueber diese Matrix.
  engel: [],
  fahrer: [],
  kunde: [],
  angehoerige: [],
}

/** Rollen, die ueberhaupt Verwaltungsbereiche betreten duerfen. */
export const VERWALTUNGSROLLEN: readonly Rolle[] = ROLLEN.filter(
  r => ROLLEN_MATRIX[r].length > 0
)

// ───────────────────────────────────────────────────────────────────────
// Abfragen
// ───────────────────────────────────────────────────────────────────────

/**
 * Kernfrage des Modells. Unbekannte Rolle ⇒ false (fail-closed): ein
 * Tippfehler in einer Rollenzuweisung darf niemals mehr Rechte ergeben.
 */
export function hatBerechtigung(rolle: string | null | undefined, berechtigung: Berechtigung): boolean {
  if (!istRolle(rolle)) return false
  return ROLLEN_MATRIX[rolle].includes(berechtigung)
}

/** Mindestens eine der genannten Berechtigungen. */
export function hatEineBerechtigung(
  rolle: string | null | undefined,
  berechtigungen: readonly Berechtigung[]
): boolean {
  return berechtigungen.some(b => hatBerechtigung(rolle, b))
}

/** Alle genannten Berechtigungen. */
export function hatAlleBerechtigungen(
  rolle: string | null | undefined,
  berechtigungen: readonly Berechtigung[]
): boolean {
  return berechtigungen.every(b => hatBerechtigung(rolle, b))
}

export function istVerwaltungsrolle(rolle: string | null | undefined): boolean {
  return istRolle(rolle) && ROLLEN_MATRIX[rolle].length > 0
}

/** admin oder superadmin — nur fuer die drei Vorbehaltsbereiche relevant. */
export function istAdministration(rolle: string | null | undefined): boolean {
  return rolle === 'admin' || rolle === 'superadmin'
}

export function berechtigungenVon(rolle: string | null | undefined): readonly Berechtigung[] {
  return istRolle(rolle) ? ROLLEN_MATRIX[rolle] : []
}

/**
 * Prueft eine Rolle gegen genau eine Berechtigung. Die Form, die die
 * Fach-Guards und die Routen benutzen.
 *
 * Ohne Verwaltungsrolle ist die Antwort immer false — auch dann, wenn
 * jemand versehentlich eine Berechtigung an 'kunde' haengen wuerde.
 */
export function rolleDarf(rolle: string | null | undefined, berechtigung: Berechtigung): boolean {
  if (!istVerwaltungsrolle(rolle)) return false
  return hatBerechtigung(rolle, berechtigung)
}

// ───────────────────────────────────────────────────────────────────────
// Zwei autoritative Quellen — eine Antwort
// ───────────────────────────────────────────────────────────────────────
//
// Grundsatz 2 nennt ZWEI Quellen, die beide nicht vom Nutzer selbst
// beschreibbar sind: `app_metadata.role` (nur ueber die GoTrue-Admin-API)
// und `profiles.role` (durch prevent_role_escalation geschuetzt).
// Ueber Jahre haben sich daraus zwei GEGENLAEUFIGE Lesarten entwickelt:
//
//   proxy.ts, lib/auth/guard.ts und app/admin/layout.tsx lasen
//     `app_metadata.role || profiles.role` — app_metadata gewinnt,
//     profiles wird gar nicht erst abgefragt, wenn app_metadata gesetzt ist.
//   Die dreizehn Fach-Guards (lib/**/api-auth.ts) lasen ausschliesslich
//     `profiles.role` und kannten app_metadata nicht.
//
// Damit hing die Antwort auf „darf diese Person das?" davon ab, WELCHE
// Schicht gefragt wurde. Praktisch bedeutsam ist die Richtung des
// Rechteentzugs: wird eine Rolle in der Datenbank herabgestuft — der
// dokumentierte Weg fuer 'superadmin', und der einzige Weg fuer jede
// Korrektur ausserhalb von /api/admin/manage-role — dann bleibt der alte,
// hoehere Wert in app_metadata stehen. Der Torwaechter (proxy.ts) liess
// die Person danach weiter in den Verwaltungsbereich, die Fach-Guards
// wiesen sie ab. Ein Entzug, der nur zur Haelfte wirkt, ist kein Entzug.
//
// REGEL AB HIER: Widersprechen sich die Quellen, gilt die SCHWAECHERE.
// Genauer, und das ist die Fassung, die entscheidet:
//
//   * `profiles` ist IMMER bindend. Fehlt der Datensatz oder traegt er
//     keine (oder eine unbekannte) Rolle, gibt es keine Berechtigung —
//     ganz gleich, was in app_metadata steht. Das entspricht dem
//     bisherigen Verhalten der Fach-Guards (`!profile` ⇒ 403) und macht
//     aus einem verwaisten Token keinen Zugang.
//   * Ist `app_metadata.role` gesetzt, wirkt es NUR noch einschraenkend:
//     gewaehrt wird die SCHNITTMENGE beider Berechtigungslisten.
//   * Ist `app_metadata.role` nicht gesetzt, entscheidet `profiles` allein
//     (unveraenderter Bestandsfall — bei den allermeisten Konten ist
//     app_metadata.role nie geschrieben worden).
//
// Die Regel kann per Konstruktion nur Rechte NEHMEN, nie geben: jede
// Aenderung an dieser Stelle ist damit rueckwaertskompatibel im Sinne der
// Sicherheit. Eine Rechte-VERGABE verlangt weiterhin, dass beide Quellen
// zustimmen — /api/admin/manage-role schreibt genau deshalb beide.
// ───────────────────────────────────────────────────────────────────────

function gesetzt(wert: string | null | undefined): wert is string {
  return typeof wert === 'string' && wert.trim() !== ''
}

/**
 * Berechtigungen, die nach BEIDEN Quellen zusammen gelten.
 *
 * `profilRolle` ist bindend: ist sie nicht gesetzt oder unbekannt, ist das
 * Ergebnis leer. Eine gesetzte `appRolle` schraenkt zusaetzlich ein.
 */
export function wirksameBerechtigungen(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
): readonly Berechtigung[] {
  const ausProfil = berechtigungenVon(profilRolle)
  if (ausProfil.length === 0) return []
  if (!gesetzt(appRolle)) return ausProfil
  const ausApp = new Set(berechtigungenVon(appRolle))
  return ausProfil.filter(b => ausApp.has(b))
}

/**
 * Die Form, die die Guards benutzen: eine Berechtigung gegen beide
 * Quellen. Ersetzt `rolleDarf(profile.role, …)` ueberall dort, wo ein
 * angemeldeter Nutzer geprueft wird.
 */
export function wirksamDarf(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
  berechtigung: Berechtigung,
): boolean {
  return wirksameBerechtigungen(appRolle, profilRolle).includes(berechtigung)
}

/** Mindestens eine der genannten Berechtigungen, ueber beide Quellen. */
export function wirksamDarfEines(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
  berechtigungen: readonly Berechtigung[],
): boolean {
  const wirksam = wirksameBerechtigungen(appRolle, profilRolle)
  return berechtigungen.some(b => wirksam.includes(b))
}

/** Alle genannten Berechtigungen, ueber beide Quellen. */
export function wirksamDarfAlle(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
  berechtigungen: readonly Berechtigung[],
): boolean {
  const wirksam = wirksameBerechtigungen(appRolle, profilRolle)
  return berechtigungen.every(b => wirksam.includes(b))
}

/**
 * Vorbehaltsbereiche (Tarife, Benutzerverwaltung, Systemeinstellungen).
 * Beide gesetzten Quellen muessen Administration sagen.
 */
export function wirksamIstAdministration(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
): boolean {
  if (!istAdministration(profilRolle)) return false
  if (!gesetzt(appRolle)) return true
  return istAdministration(appRolle)
}

/** Darf der Verwaltungsbereich ueberhaupt betreten werden? */
export function wirksamIstVerwaltungsrolle(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
): boolean {
  return wirksameBerechtigungen(appRolle, profilRolle).length > 0
}

/**
 * Rollenname fuer Anzeige und Protokoll.
 *
 * Entschieden wird ueber die Berechtigungen (oben) — dieser Wert ist die
 * Beschriftung dazu. Widersprechen sich die Quellen, steht hier die
 * engere: das ist die, nach der tatsaechlich gehandelt wurde. Bei
 * gleicher Weite gewinnt `profiles`, weil dort der Personendatensatz
 * gefuehrt wird.
 */
export function wirksameRolle(
  appRolle: string | null | undefined,
  profilRolle: string | null | undefined,
): string {
  if (!gesetzt(profilRolle)) return ''
  if (!gesetzt(appRolle) || appRolle === profilRolle) return profilRolle
  return berechtigungenVon(appRolle).length < berechtigungenVon(profilRolle).length
    ? appRolle
    : profilRolle
}
