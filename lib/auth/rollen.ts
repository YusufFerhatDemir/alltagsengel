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
  // Konten, Rollen, Passwortzurücksetzung
  'benutzer.verwalten',
  // Systemeinstellungen, Feature-Flags, Schnittstellen (KIM/FHIR/Sync)
  'system.verwalten',
  // Auswertungen und Kennzahlen
  'berichte.lesen',
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
