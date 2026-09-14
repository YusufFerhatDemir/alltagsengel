// ═══════════════════════════════════════════════════════════════════════
// Block 29 — Pflichtnachweise der Einsatzfreigabe
// ═══════════════════════════════════════════════════════════════════════
//
// BEFUND (14.09.2026)
//
// `lib/bewerbung/ats-felder.ts` trägt einen Riegel, der bewusst IMMER
// `false` liefert — `darfAlsVerifiziertGelten()`. Seine Begründung steht
// wörtlich daneben:
//
//   „`fzStatus = 'eingetroffen'` heißt, dass jemand das in eine Maske
//    getippt hat — nicht, dass ein Führungszeugnis vorliegt. […] Bei
//    § 45a hängt daran die Einsatzfreigabe."
//
// Eine Stufe später galt diese Strenge nicht mehr. Die Einsatzfreigabe
// prüfte:
//
//     q.title?.toLowerCase().includes('führungszeugnis') && q.pflicht
//
// Eine von Hand angelegte Zeile mit `title: 'Erweitertes
// Führungszeugnis'`, `pflicht: true`, `dokument_id: null` und
// `verifiziert_am: null` passierte das. Kein Dokument, kein Prüfer, kein
// Zeitpunkt — und der Mitarbeiter war für den Einsatz bei
// pflegebedürftigen Menschen freigegeben.
//
// Die Belegkette existierte längst: `caregiver_qualifications` führt
// `dokument_id`, `verifiziert_von` und `verifiziert_am`, und
// `updateQualifikation` pflegt sie. Gelesen hat sie niemand — weder für
// diese noch für irgendeine andere Entscheidung.
//
// ── ZWEITER BEFUND: DER TITEL IST FREITEXT ────────────────────────────
//
// Der Abgleich lief über einen Teilstring im frei tippbaren `title`. Das
// trifft in beide Richtungen daneben:
//
//   „Führungszeugnis beantragt"  → zählt als vorliegender Nachweis
//   „Erw. FZ"                    → zählt nicht, obwohl es eines ist
//
// Die Tabelle führt `qualification_type` mit einer festen Werteliste
// (`fuehrungszeugnis`, `erste_hilfe`, …). Der Typ entscheidet jetzt; der
// Titel bleibt als Rückfall für Altbestand, der vor Einführung der Spalte
// angelegt wurde.
//
// ── LIVE-WIRKUNG ──────────────────────────────────────────────────────
//
// Am 14.09.2026 gemessen: `caregiver_qualifications` hat 0 Zeilen, beide
// Mitarbeiter stehen auf `einsatzfreigabe = false`. Die Verschärfung
// nimmt also keiner bestehenden Freigabe ihre Grundlage — sie schließt
// die Tür, bevor zum ersten Mal jemand hindurchgeht.
import { heuteBerlin } from '@/lib/utils/timezone'

export interface PflichtQualifikation {
  /** Kanonischer Wert aus QUALIFIKATIONSTYP_WERTE. */
  typ: string
  /** Rückfall für Altbestand ohne gesetzten Typ. */
  suchbegriff: string
  label: string
}

/**
 * Ohne diese beiden darf niemand zum Klienten.
 *
 * Die Liste steht hier und nicht mehr in `einsatzfreigabe.ts`, damit die
 * Regel eine Stelle hat: Freigabeprüfung, Prüfskript und Tests lesen
 * dieselbe.
 */
export const PFLICHT_QUALIFIKATIONEN: readonly PflichtQualifikation[] = [
  { typ: 'fuehrungszeugnis', suchbegriff: 'führungszeugnis', label: 'Erweitertes Führungszeugnis' },
  { typ: 'erste_hilfe', suchbegriff: 'erste hilfe', label: 'Erste-Hilfe-Nachweis' },
]

export interface NachweisZeile {
  id?: string
  title?: string | null
  qualification_type?: string | null
  valid_until?: string | null
  pflicht?: boolean | null
  einsatzrelevant?: boolean | null
  dokument_id?: string | null
  verifiziert_am?: string | null
  verifiziert_von?: string | null
  status?: string | null
}

/**
 * Die Spalten, die eine Freigabeprüfung braucht.
 *
 * Als Konstante, weil genau hier der Fehler entstand: die Abfrage
 * selektierte `dokument_id`, `verifiziert_am` und `verifiziert_von` nicht
 * — und eine Prüfung, die ein Feld nicht liest, kann es auch nicht
 * verlangen. Wer die Abfrage kopiert, bekommt die Belegspalten mit.
 */
export const NACHWEIS_SPALTEN =
  'id, title, qualification_type, valid_until, einsatzrelevant, pflicht, dokument_id, verifiziert_am, verifiziert_von, status'

/**
 * Gehört diese Zeile zu dieser Pflichtqualifikation?
 *
 * Der kanonische Typ entscheidet. Der Titel-Teilstring greift nur, wenn
 * `qualification_type` leer ist — also bei Altbestand. Ein Datensatz mit
 * gesetztem, aber anderem Typ zählt NICHT über seinen Titel: sonst
 * schlüge „Fortbildung: Auffrischung Führungszeugnis-Recht" als
 * Führungszeugnis durch.
 */
export function passtZuPflicht(zeile: NachweisZeile, pflicht: PflichtQualifikation): boolean {
  const typ = zeile.qualification_type?.trim()
  if (typ) return typ === pflicht.typ
  return (zeile.title ?? '').toLowerCase().includes(pflicht.suchbegriff)
}

/**
 * Welche Stufe der Belegkette fehlt? `null`, wenn sie vollständig ist.
 *
 * Fail-closed und in dieser Reihenfolge: erst muss es ein Dokument geben,
 * dann muss jemand hineingesehen haben. Ein Prüfvermerk ohne Dokument ist
 * keine Prüfung, sondern eine Behauptung über eine — genau der Fall, den
 * `darfAlsVerifiziertGelten()` im Bewerbungsverfahren abweist.
 */
export function belegLuecke(zeile: NachweisZeile): string | null {
  if (zeile.status === 'pending') return 'Nachweis steht noch aus (Status „pending")'
  if (!zeile.dokument_id) return 'kein Dokument hinterlegt'
  if (!zeile.verifiziert_am || !zeile.verifiziert_von) return 'Dokument liegt vor, ist aber nicht geprüft'
  return null
}

/**
 * Alle Beanstandungen an den Pflichtnachweisen, in Klartext.
 *
 * Gibt eine leere Liste zurück, wenn beide Pflichtnachweise vorliegen,
 * gültig und belegt sind.
 */
export function pflichtProbleme(
  quals: readonly NachweisZeile[],
  heute: string = heuteBerlin(),
): string[] {
  const probleme: string[] = []

  for (const pflicht of PFLICHT_QUALIFIKATIONEN) {
    const vorhanden = quals.find(q => q.pflicht && passtZuPflicht(q, pflicht))

    if (!vorhanden) {
      probleme.push(`Pflichtqualifikation "${pflicht.label}" fehlt`)
      continue
    }

    if (vorhanden.valid_until && vorhanden.valid_until < heute) {
      // Die Sammelmeldung über abgelaufene Nachweise nennt nur eine Anzahl.
      // Für eine Pflichtqualifikation gehört der Name in den Klartext —
      // sonst sucht die Disposition, was nachzureichen ist.
      probleme.push(`Pflichtqualifikation "${pflicht.label}" ist am ${vorhanden.valid_until} abgelaufen`)
      continue
    }

    const luecke = belegLuecke(vorhanden)
    if (luecke) {
      probleme.push(`Pflichtqualifikation "${pflicht.label}": ${luecke}`)
    }
  }

  return probleme
}
