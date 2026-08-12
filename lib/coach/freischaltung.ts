// ═══════════════════════════════════════════════════════════════
// PflegeCoach — Freischaltcodes (Schritte 2 + 3 des DiPA-Nutzerflows)
//
// ABLAUF: Pflegekasse genehmigt → Nutzer erhält einen Code → Nutzer gibt
// den Code in der App ein → Zugang ist freigeschaltet.
//
// OFFEN (bewusst nicht festgelegt): Ob ein Code-Verfahren für DiPA
// verbindlich vorgesehen ist und wer die Codes ausgibt, ist regulatorisch
// nicht abschließend geklärt (siehe audit/dipa/nutzerflow_dipa.md,
// ORF-DIPA-FLOW). Das Modul bildet deshalb nur den MECHANISMUS ab und
// unterstützt über `quelle` auch Pilot- und Testzugänge.
//
// SICHERHEIT:
//  * Codes werden nie im Klartext gespeichert — nur als SHA-256-Hash über
//    (normalisierter Code + serverseitiger Pfeffer).
//  * Der Pfeffer steht in COACH_CODE_PEPPER (Env). Fehlt er, wird der
//    Hash trotzdem gebildet, aber ohne Pfeffer — die Anwendung muss dann
//    beim Start warnen (siehe pepperKonfiguriert()).
//  * Codes werden aus einem Alphabet ohne verwechselbare Zeichen erzeugt
//    (kein 0/O, 1/I/L) — Barrierefreiheit für die Zielgruppe.
// ═══════════════════════════════════════════════════════════════

import { createHash, randomInt } from 'crypto'

export type FreischaltQuelle = 'pflegekasse' | 'hersteller_pilot' | 'testzugang'
export type FreischaltCodeStatus = 'ausgegeben' | 'eingeloest' | 'abgelaufen' | 'storniert'
export type FreischaltungStatus = 'aktiv' | 'abgelaufen' | 'widerrufen'

export const FREISCHALT_QUELLEN: FreischaltQuelle[] = ['pflegekasse', 'hersteller_pilot', 'testzugang']

export const FREISCHALT_QUELLE_LABELS: Record<FreischaltQuelle, string> = {
  pflegekasse: 'Genehmigung der Pflegekasse',
  hersteller_pilot: 'Pilotzugang des Herstellers',
  testzugang: 'Testzugang (nicht abrechenbar)',
}

/** Ohne 0/O/1/I/L — für gedruckte Codes und Vorlesen am Telefon. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const BLOCK_LAENGE = 4
const BLOECKE = 3

export const CODE_ENV_PEPPER = 'COACH_CODE_PEPPER'

/**
 * Normalisiert Nutzereingaben: Groß-/Kleinschreibung, Leerzeichen und
 * Bindestriche sind egal.
 *
 * Eine Verwechslungs-Korrektur (0↔O, 1↔I↔L) ist bewusst NICHT nötig:
 * diese Zeichen kommen im Alphabet gar nicht vor, ein Code kann sie also
 * nie enthalten. Eine Umschreibung würde nur falsche Treffer erzeugen.
 */
export function normalisiereCode(eingabe: string): string {
  return eingabe.toUpperCase().replace(/[\s-]/g, '').trim()
}

/**
 * Erzeugt einen neuen Code im Format XXXX-XXXX-XXXX.
 * Nutzt crypto.randomInt (CSPRNG), nicht Math.random.
 */
export function erzeugeCode(): string {
  const bloecke: string[] = []
  for (let b = 0; b < BLOECKE; b++) {
    let block = ''
    for (let i = 0; i < BLOCK_LAENGE; i++) {
      block += ALPHABET[randomInt(ALPHABET.length)]
    }
    bloecke.push(block)
  }
  return bloecke.join('-')
}

export function pepperKonfiguriert(): boolean {
  return Boolean(process.env[CODE_ENV_PEPPER])
}

/** SHA-256 über normalisierten Code + serverseitigen Pfeffer. */
export function hashCode(code: string): string {
  const pepper = process.env[CODE_ENV_PEPPER] ?? ''
  return createHash('sha256').update(`${normalisiereCode(code)}|${pepper}`).digest('hex')
}

/** Erste 4 Zeichen des ausgegebenen Codes — nur zur Wiedererkennung in der Liste. */
export function codePraefix(code: string): string {
  return normalisiereCode(code).slice(0, 4)
}

/** Grobe Formatprüfung vor dem Datenbank-Zugriff (spart Lookups). */
export function istCodeFormatGueltig(eingabe: string): boolean {
  const norm = normalisiereCode(eingabe)
  return norm.length === BLOCK_LAENGE * BLOECKE && /^[A-Z0-9]+$/.test(norm)
}

export interface CodeGueltigkeitEingabe {
  status: FreischaltCodeStatus
  gueltig_von: string | null
  gueltig_bis: string | null
  /** Vergleichsdatum als ISO-Datum (YYYY-MM-DD) — injiziert für Testbarkeit. */
  heute: string
}

export type CodeGueltigkeit =
  | { gueltig: true }
  | { gueltig: false; grund: string }

/** Prüft, ob ein gefundener Code eingelöst werden darf. */
export function pruefeCodeGueltigkeit(e: CodeGueltigkeitEingabe): CodeGueltigkeit {
  if (e.status === 'eingeloest') return { gueltig: false, grund: 'Dieser Code wurde bereits eingelöst.' }
  if (e.status === 'storniert') return { gueltig: false, grund: 'Dieser Code wurde zurückgezogen.' }
  if (e.status === 'abgelaufen') return { gueltig: false, grund: 'Dieser Code ist abgelaufen.' }
  if (e.gueltig_von && e.heute < e.gueltig_von) {
    return { gueltig: false, grund: `Dieser Code gilt erst ab dem ${formatDatum(e.gueltig_von)}.` }
  }
  if (e.gueltig_bis && e.heute > e.gueltig_bis) {
    return { gueltig: false, grund: 'Dieser Code ist abgelaufen.' }
  }
  return { gueltig: true }
}

export interface FreischaltungZeile {
  status: FreischaltungStatus
  gueltig_von: string
  gueltig_bis: string | null
}

/**
 * Ist der Zugang zum Produkt aktuell freigeschaltet?
 * Mehrere Freischaltungen sind möglich (z. B. Verlängerung) — es genügt
 * eine aktive und zeitlich gültige.
 */
export function istFreigeschaltet(zeilen: FreischaltungZeile[], heute: string): boolean {
  return zeilen.some(z =>
    z.status === 'aktiv' &&
    z.gueltig_von <= heute &&
    (!z.gueltig_bis || z.gueltig_bis >= heute)
  )
}

function formatDatum(iso: string): string {
  const [j, m, t] = iso.slice(0, 10).split('-')
  return t && m && j ? `${t}.${m}.${j}` : iso
}
