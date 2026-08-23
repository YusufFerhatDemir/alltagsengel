// ═══════════════════════════════════════════════════════════════
// EINSATZ-KONFLIKTE — Überschneidungen erkennen, bevor die DB sie meldet
// ═══════════════════════════════════════════════════════════════
// Befund Bereich 3 der Lückenanalyse (P2): „Kalender und Schedule enthalten
// keinerlei Konflikt-/Überschneidungslogik; ein Konflikt äußert sich erst als
// Datenbankfehler beim Speichern."
//
// Der DB-Trigger `check_assignment_overlap` (Migration 20260808200000) fängt
// die Doppelbelegung EINER Betreuungskraft ab — aber erst beim INSERT, mit
// einer rohen Postgres-Meldung ("DOPPELBELEGUNG: Mitarbeiter <uuid> …"), die
// der Fehler-Sanitizer zu Recht verschluckt. Der Planende sieht also nur, dass
// etwas schiefging, nicht was.
//
// Diese Datei ist bewusst FREI von Server-Importen (kein supabase, kein next):
// dieselbe Funktion prüft serverseitig vor dem Schreiben und markiert
// clientseitig im Kalender. Zwei Implementierungen derselben Regel wären genau
// die Sorte Drift, die den Trigger und die UI auseinanderlaufen lässt.
//
// KEINE zweite Wahrheit gegenüber dem Trigger: die Mitarbeiter-Überschneidung
// hat exakt dieselbe Semantik (gleiches Datum, echte Zeitüberlappung, Status
// STORNIERT/cancelled/NO_SHOW zählen nicht). Zusätzlich — und darüber hinaus —
// wird die Klienten-Überschneidung erkannt, die der Trigger NICHT kennt: zwei
// Betreuungskräfte gleichzeitig bei derselben Person. Das ist fachlich nicht
// immer falsch (Doppelbesetzung beim Transfer), deshalb warnt sie nur.
// ═══════════════════════════════════════════════════════════════

/** Status, die keinen Konflikt mehr auslösen — identisch zum DB-Trigger. */
export const KONFLIKTFREIE_STATUS = ['STORNIERT', 'cancelled', 'NO_SHOW'] as const

export interface KonfliktEinsatz {
  id: string
  client_id: string | null
  caregiver_id: string | null
  assignment_date: string | null
  start_time: string | null
  end_time: string | null
  status: string | null
  /** Optional, nur für die Meldung — nie für die Prüfung. */
  client_name?: string | null
  caregiver_name?: string | null
}

export type KonfliktArt = 'mitarbeiter' | 'klient'

export interface Konflikt {
  art: KonfliktArt
  /** Der bestehende Einsatz, mit dem sich der Kandidat überschneidet. */
  gegenId: string
  meldung: string
}

/**
 * 'HH:MM' und 'HH:MM:SS' zu Minuten seit Mitternacht.
 *
 * Ein reiner String-Vergleich wäre hier falsch: '09:00' und '09:00:00'
 * bezeichnen dieselbe Uhrzeit, sortieren aber unterschiedlich. Postgres
 * liefert `time`-Spalten als 'HH:MM:SS', Formulare schicken 'HH:MM'.
 */
export function zeitZuMinuten(zeit: string | null | undefined): number | null {
  if (!zeit) return null
  const treffer = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(zeit.trim())
  if (!treffer) return null
  const stunden = Number(treffer[1])
  const minuten = Number(treffer[2])
  if (stunden > 23 || minuten > 59) return null
  return stunden * 60 + minuten
}

/**
 * Echte Überschneidung zweier Zeitspannen — Berührung an den Rändern zählt
 * nicht (09:00–10:00 und 10:00–11:00 sind kein Konflikt). Gleiche Regel wie
 * `start_time < NEW.end_time AND end_time > NEW.start_time` im Trigger.
 *
 * Fail-open bei unlesbaren Zeiten: eine kaputte Uhrzeit ist ein Eingabefehler,
 * den die Pflichtfeldprüfung meldet — hier daraus einen Konflikt zu machen,
 * würde eine falsche Ursache anzeigen.
 */
export function zeitenUeberschneiden(
  aStart: string | null, aEnde: string | null,
  bStart: string | null, bEnde: string | null,
): boolean {
  const a1 = zeitZuMinuten(aStart), a2 = zeitZuMinuten(aEnde)
  const b1 = zeitZuMinuten(bStart), b2 = zeitZuMinuten(bEnde)
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false
  return a1 < b2 && a2 > b1
}

/** Zählt dieser Einsatz für die Konfliktprüfung noch? */
export function istAktiv(status: string | null | undefined): boolean {
  return !(KONFLIKTFREIE_STATUS as readonly string[]).includes(status ?? '')
}

function name(wert: string | null | undefined, ersatz: string): string {
  const s = (wert ?? '').trim()
  return s === '' ? ersatz : s
}

function zeitraum(e: KonfliktEinsatz): string {
  return `${(e.start_time ?? '').slice(0, 5)}–${(e.end_time ?? '').slice(0, 5)}`
}

/**
 * Findet alle Überschneidungen eines Kandidaten mit einem Bestand.
 *
 * Es wird ausschließlich gegen Einsätze MIT `assignment_date` geprüft. Eine
 * Serie (weekday + recurrence_rule) hat kein einzelnes Datum; der Trigger
 * behandelt sie über einen eigenen Zweig, und ohne die Serienauflösung hier
 * nachzubauen wäre jede Aussage dazu geraten. Das ist bewusst offen gelassen
 * und in der Antwort der Route benannt.
 */
export function findeKonflikte(
  kandidat: KonfliktEinsatz,
  bestand: KonfliktEinsatz[],
): Konflikt[] {
  if (!kandidat.assignment_date || !istAktiv(kandidat.status)) return []

  const konflikte: Konflikt[] = []
  for (const vorhanden of bestand) {
    if (vorhanden.id === kandidat.id) continue
    if (!istAktiv(vorhanden.status)) continue
    if (vorhanden.assignment_date !== kandidat.assignment_date) continue
    if (!zeitenUeberschneiden(
      kandidat.start_time, kandidat.end_time,
      vorhanden.start_time, vorhanden.end_time,
    )) continue

    if (kandidat.caregiver_id && vorhanden.caregiver_id === kandidat.caregiver_id) {
      konflikte.push({
        art: 'mitarbeiter',
        gegenId: vorhanden.id,
        meldung:
          `${name(vorhanden.caregiver_name, 'Die Betreuungskraft')} hat am ` +
          `${kandidat.assignment_date} bereits einen Einsatz von ${zeitraum(vorhanden)} ` +
          `bei ${name(vorhanden.client_name, 'einem anderen Klienten')}.`,
      })
      continue
    }

    if (kandidat.client_id && vorhanden.client_id === kandidat.client_id) {
      konflikte.push({
        art: 'klient',
        gegenId: vorhanden.id,
        meldung:
          `${name(vorhanden.client_name, 'Der Klient')} hat am ` +
          `${kandidat.assignment_date} zur selben Zeit (${zeitraum(vorhanden)}) bereits ` +
          `einen Einsatz mit ${name(vorhanden.caregiver_name, 'einer anderen Betreuungskraft')}.`,
      })
    }
  }
  return konflikte
}

/**
 * IDs aller Einsätze, die sich innerhalb einer Liste gegenseitig
 * überschneiden — für die Markierung im Kalender.
 */
export function konfliktIds(einsaetze: KonfliktEinsatz[]): Set<string> {
  const treffer = new Set<string>()
  for (const kandidat of einsaetze) {
    for (const k of findeKonflikte(kandidat, einsaetze)) {
      treffer.add(kandidat.id)
      treffer.add(k.gegenId)
    }
  }
  return treffer
}
