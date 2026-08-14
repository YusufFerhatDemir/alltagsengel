// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Zweiter Faktor (TOTP)
//
// Deckt DiPA-Matrix SEC-03 ab: „Zweiter Faktor bei der Anmeldung".
//
// ENTSCHEIDUNGEN (bewusst, mit Begründung — sie sind prüfungsrelevant):
//
//  1. TOTP (RFC 6238) über die Auth-Schicht von Supabase. Kein SMS-Faktor:
//     SMS ist nachweislich angreifbar (SIM-Swap) und erzeugt zusätzlich eine
//     Telefonnummer als personenbezogenes Datum — Datenminimierung spricht
//     dagegen (Art. 5 Abs. 1 lit. c DSGVO).
//
//  2. FREIWILLIG per Voreinstellung (`COACH_MFA_PFLICHT` = false). Die
//     Zielgruppe umfasst hochaltrige und technisch wenig geübte Menschen;
//     eine erzwungene Authenticator-App würde einen Teil von ihnen vom
//     eigenen Pflegetagebuch aussperren. Der Faktor ist vorhanden,
//     einrichtbar und wird — sobald eingerichtet — technisch durchgesetzt.
//     Ob DiPA einen PFLICHT-Faktor verlangt, ist offen (BfArM-Beratung,
//     REG-05); der Schalter macht die Umstellung zu einer Deployment-,
//     nicht zu einer Code-Entscheidung.
//
//  3. Durchsetzung fail-closed für Nutzer MIT Faktor: Wer einen
//     verifizierten Faktor hat, dessen Sitzung aber nur auf AAL1 steht,
//     darf NICHT schreiben. Sonst wäre der zweite Faktor eine Zierde —
//     ein gestohlenes Passwort allein käme weiterhin an die Daten.
//
// Dieses Modul ist bewusst frei von IO: nur reine Auswertung, damit die
// Regeln testbar sind (lib/coach/mfa.test.ts) und in Route-Handlern wie in
// der Oberfläche dieselben bleiben.
// ═══════════════════════════════════════════════════════════════

export const COACH_MFA_PFLICHT_ENV = 'COACH_MFA_PFLICHT'

/**
 * Muss jeder PflegeCoach-Nutzer einen zweiten Faktor haben?
 *
 * Default AUS (siehe Entscheidung 2 oben). Der Schalter wirkt nur auf
 * schreibende Zugriffe — Lesen, Export und Löschung bleiben immer offen,
 * sonst sperrte eine Umstellung Nutzer von ihren eigenen Daten aus.
 */
export function mfaPflicht(): boolean {
  return process.env[COACH_MFA_PFLICHT_ENV] === 'true'
}

export type MfaFaktorStatus = 'verified' | 'unverified'

/** Ausschnitt aus der Faktor-Struktur der Auth-Schicht — nur was wir brauchen. */
export interface MfaFaktor {
  id: string
  factor_type?: string | null
  status?: string | null
  friendly_name?: string | null
  created_at?: string | null
}

/** Authenticator Assurance Level der laufenden Sitzung. */
export type MfaNiveau = 'aal1' | 'aal2' | null

export const MFA_ZWEITER_FAKTOR_CODE = 'MFA_ZWEITER_FAKTOR_NOETIG'
export const MFA_ZWEITER_FAKTOR_TEXT =
  'Für Ihr Konto ist ein zweiter Faktor eingerichtet. Bitte melden Sie sich erneut an und ' +
  'geben Sie den Code aus Ihrer Authenticator-App ein. Ihre gespeicherten Daten bleiben unverändert.'

export const MFA_EINRICHTUNG_CODE = 'MFA_EINRICHTUNG_NOETIG'
export const MFA_EINRICHTUNG_TEXT =
  'Für neue Einträge ist ein zweiter Faktor erforderlich. Bitte richten Sie ihn unter ' +
  '„Einstellungen → Anmeldesicherheit" ein.'

/** Nur bestätigte Faktoren zählen — ein abgebrochener Einrichtungsversuch nicht. */
export function verifizierteFaktoren(faktoren: MfaFaktor[] | null | undefined): MfaFaktor[] {
  return (faktoren ?? []).filter(f => f.status === 'verified')
}

/** Hat der Nutzer einen einsatzbereiten zweiten Faktor? */
export function mfaEingerichtet(faktoren: MfaFaktor[] | null | undefined): boolean {
  return verifizierteFaktoren(faktoren).length > 0
}

export interface MfaStand {
  /** Mindestens ein bestätigter Faktor vorhanden. */
  eingerichtet: boolean
  /** Angefangene, nie bestätigte Einrichtungen (können aufgeräumt werden). */
  unbestaetigt: number
  /** Niveau der laufenden Sitzung. */
  niveau: MfaNiveau
  /** Sitzung erfüllt das Niveau, das die eingerichteten Faktoren verlangen. */
  niveauErfuellt: boolean
  /** Ist der zweite Faktor betrieblich verpflichtend? */
  pflicht: boolean
}

export function mfaStand(
  faktoren: MfaFaktor[] | null | undefined,
  niveau: MfaNiveau,
  pflicht = mfaPflicht()
): MfaStand {
  const eingerichtet = mfaEingerichtet(faktoren)
  return {
    eingerichtet,
    unbestaetigt: (faktoren ?? []).filter(f => f.status === 'unverified').length,
    niveau,
    // Ohne eingerichteten Faktor ist AAL1 das erreichbare Höchstniveau —
    // dann ist die Anforderung erfüllt, nicht verletzt.
    niveauErfuellt: eingerichtet ? niveau === 'aal2' : true,
    pflicht,
  }
}

export interface MfaSperre {
  code: typeof MFA_ZWEITER_FAKTOR_CODE | typeof MFA_EINRICHTUNG_CODE
  text: string
}

/**
 * Darf mit dieser Sitzung geschrieben werden?
 * `null` = erlaubt, sonst die fertige Begründung für die Ablehnung.
 *
 * Reihenfolge ist Absicht: Wer einen Faktor hat, wird zuerst auf das
 * Sitzungsniveau geprüft — das ist der sicherheitsrelevante Fall. Die
 * Pflicht-Prüfung greift erst danach und nur für Nutzer ohne Faktor.
 */
export function mfaSperre(stand: MfaStand): MfaSperre | null {
  if (stand.eingerichtet && !stand.niveauErfuellt) {
    return { code: MFA_ZWEITER_FAKTOR_CODE, text: MFA_ZWEITER_FAKTOR_TEXT }
  }
  if (stand.pflicht && !stand.eingerichtet) {
    return { code: MFA_EINRICHTUNG_CODE, text: MFA_EINRICHTUNG_TEXT }
  }
  return null
}

/**
 * Muss der Anmeldevorgang nach Passwort noch einen Code abfragen?
 * Wird im Login verwendet: `nextLevel` meldet die Auth-Schicht auf Basis der
 * eingerichteten Faktoren, `currentLevel` das erreichte Niveau.
 */
export function codeAbfrageNoetig(aktuell: MfaNiveau, naechstes: MfaNiveau): boolean {
  return naechstes === 'aal2' && aktuell !== 'aal2'
}

/** Anzeigename eines Faktors — nie leer, damit die Liste bedienbar bleibt. */
export function faktorName(faktor: MfaFaktor): string {
  const name = (faktor.friendly_name ?? '').trim()
  return name.length > 0 ? name : 'Authenticator-App'
}
